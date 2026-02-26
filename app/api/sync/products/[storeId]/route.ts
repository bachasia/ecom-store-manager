import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { ShopbaseClient } from "@/lib/integrations/shopbase"
import { WooCommerceClient } from "@/lib/integrations/woocommerce"

class CancelledError extends Error {
  constructor() { super('Cancelled by user'); this.name = 'CancelledError' }
}

// POST /api/sync/products/[storeId] - Sync products from store
export async function POST(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const store = await prisma.store.findFirst({
      where: { id: storeId, userId: session.user.id }
    })

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    // Cleanup stale started logs (crashed/aborted processes)
    const staleCutoff = new Date(Date.now() - 2 * 60 * 1000)
    await prisma.syncLog.updateMany({
      where: {
        storeId: store.id,
        status: 'started',
        completedAt: null,
        startedAt: { lt: staleCutoff },
      },
      data: {
        status: 'cancelled',
        errorMessage: 'Auto-cancelled stale sync log',
        completedAt: new Date(),
      }
    })

    // Acquire per-store sync lock to prevent duplicate runs
    const syncLog = await prisma.$transaction(async (tx) => {
      const runningLogs = await tx.syncLog.count({
        where: {
          storeId: store.id,
          status: 'started',
          completedAt: null,
        }
      })

      if (runningLogs > 0) return null

      const lock = await tx.store.updateMany({
        where: {
          id: store.id,
          OR: [
            { lastSyncStatus: null },
            { lastSyncStatus: { notIn: ['in_progress', 'cancelling'] } },
          ],
        },
        data: { lastSyncStatus: 'in_progress', lastSyncError: null }
      })

      if (lock.count === 0) return null

      return tx.syncLog.create({
        data: { storeId: store.id, syncType: 'products', status: 'started' }
      })
    })

    if (!syncLog) {
      await prisma.store.update({
        where: { id: store.id },
        data: {
          lastSyncStatus: null,
          lastSyncError: 'Sync lock detected. Please retry.',
        }
      }).catch(() => undefined)

      return NextResponse.json(
        { error: 'Store is already syncing. Please wait for current sync to finish.' },
        { status: 409 }
      )
    }

    try {
      let productsCreated = 0
      let productsUpdated = 0
      let productsSkipped = 0
      let productsDeactivated = 0
      let skuWarnings: string[] = []
      let skipDeactivate = false  // true khi incremental sync — không biết product nào bị xóa

      // ─── Helper: kiểm tra cancel flag từ DB ──────────────────────────────
      const isCancelled = async (): Promise<boolean> => {
        const current = await prisma.store.findUnique({
          where: { id: store.id },
          select: { lastSyncStatus: true }
        })
        return current?.lastSyncStatus === 'cancelling'
      }

      // Track externalIds đã thấy trong lần sync này — dùng để deactivate sau
      const seenExternalIds = new Set<string>()

      // ─── Helper: upsert một variant/product vào DB ───────────────────────
      const upsertProduct = async (data: {
        externalId: string
        parentExternalId: string | null  // product-level ID, null nếu simple product
        sku: string
        name: string
        variantName: string | null
        price: number
        imageUrl?: string | null
      }) => {
        seenExternalIds.add(data.externalId)

        const existing = await prisma.product.findUnique({
          where: {
            storeId_externalId_sku: {
              storeId: store.id,
              externalId: data.externalId,
              sku: data.sku,
            }
          }
        })

        if (existing) {
          const priceChanged = parseFloat(existing.price.toString()) !== data.price
          const nameChanged = existing.name !== data.name
          const variantChanged = (existing.variantName ?? null) !== (data.variantName ?? null)
          const imageChanged = (existing.imageUrl ?? null) !== (data.imageUrl ?? null)
          const parentChanged = (existing.parentExternalId ?? null) !== (data.parentExternalId ?? null)
          const wasInactive = !existing.isActive

          if (priceChanged || nameChanged || variantChanged || imageChanged || parentChanged || wasInactive) {
            await prisma.product.update({
              where: { id: existing.id },
              data: {
                name: data.name,
                variantName: data.variantName,
                parentExternalId: data.parentExternalId ?? null,
                price: data.price,
                imageUrl: data.imageUrl ?? null,
                isActive: true,
              },
            })
            productsUpdated++
          } else {
            productsSkipped++
          }
        } else {
          await prisma.product.create({
            data: {
              storeId: store.id,
              externalId: data.externalId,
              parentExternalId: data.parentExternalId ?? null,
              sku: data.sku,
              name: data.name,
              variantName: data.variantName,
              price: data.price,
              imageUrl: data.imageUrl ?? null,
              isActive: true,
            }
          })
          productsCreated++
        }
      }

      // ─── ShopBase ────────────────────────────────────────────────────────
      if (store.platform === 'shopbase') {
        if (!store.apiSecret) throw new Error('API Password is required for ShopBase')

        const client = new ShopbaseClient(store.apiUrl, store.apiKey, store.apiSecret)
        const products = await client.getAllProducts()

        for (const product of products) {
          if (await isCancelled()) throw new CancelledError()

          // Build map: imageId → src để lookup nhanh
          const imageMap = new Map(product.images.map(img => [img.id, img.src]))
          const firstImageSrc = product.images[0]?.src ?? null

          for (const variant of product.variants) {
            const sku = variant.sku?.trim() || `sb-variant-${variant.id}`
            const variantName = variant.title && variant.title !== 'Default Title'
              ? variant.title
              : null

            // Ảnh của variant: dùng image_id nếu có, fallback về ảnh đầu tiên của product
            const imageUrl = variant.image_id
              ? (imageMap.get(variant.image_id) ?? firstImageSrc)
              : firstImageSrc

            await upsertProduct({
              externalId: variant.id.toString(),
              parentExternalId: product.id.toString(),
              sku,
              name: product.title,
              variantName,
              price: parseFloat(variant.price) || 0,
              imageUrl,
            })
          }
        }

      // ─── WooCommerce ─────────────────────────────────────────────────────
      } else if (store.platform === 'woocommerce') {
        if (!store.apiSecret) throw new Error('API Secret is required for WooCommerce')

        const client = new WooCommerceClient(store.apiUrl, store.apiKey, store.apiSecret)

        // Incremental: chỉ fetch products thay đổi kể từ lần sync trước
        // Full sync nếu chưa có lastSyncAt
        const isIncremental = !!store.lastSyncAt
        const modifiedAfter = isIncremental
          ? store.lastSyncAt!.toISOString()
          : undefined

        if (isIncremental) {
          console.info(`[sync:products] WooCommerce incremental sync — modified_after=${modifiedAfter}`)
        } else {
          console.info('[sync:products] WooCommerce full sync')
        }

        const products = await client.getAllProducts({ modifiedAfter })

        for (const product of products) {
          if (await isCancelled()) throw new CancelledError()

          const productImageUrl = product.images?.[0]?.src ?? null

          if (product.type === 'simple') {
            if (!product.sku?.trim()) {
              const warning = `Simple product id=${product.id} "${product.name}" has no SKU — skipped`
              console.warn('[sync:products]', warning)
              skuWarnings.push(`"${product.name}" (id=${product.id})`)
              continue
            }

            await upsertProduct({
              externalId: product.id.toString(),
              parentExternalId: null,  // simple product — không có parent
              sku: product.sku.trim(),
              name: product.name,
              variantName: null,
              price: parseFloat(product.price) || 0,
              imageUrl: productImageUrl,
            })

          } else if (product.type === 'variable') {
            if (!product.variations || product.variations.length === 0) continue

            const variations = await client.getProductVariations(product.id)

            for (const variation of variations) {
              if (!variation.sku?.trim()) {
                const warning = `Variation id=${variation.id} of "${product.name}" has no SKU — skipped`
                console.warn('[sync:products]', warning)
                skuWarnings.push(`"${product.name}" variation id=${variation.id}`)
                continue
              }

              const variantName = variation.attributes.length > 0
                ? variation.attributes.map(a => a.option).join(' / ')
                : null

              // Ảnh variation riêng → fallback về ảnh product
              const imageUrl = variation.image?.src ?? productImageUrl

              await upsertProduct({
                externalId: variation.id.toString(),
                parentExternalId: product.id.toString(),
                sku: variation.sku.trim(),
                name: product.name,
                variantName,
                price: parseFloat(variation.price) || 0,
                imageUrl,
              })
            }
          }
          // grouped, external: bỏ qua
        }

        // Incremental sync không fetch full list nên không thể biết product nào bị xóa
        if (isIncremental) skipDeactivate = true

      } else {
        throw new Error('Platform not supported')
      }

      // ─── Deactivate sản phẩm không còn trong API (chỉ full sync) ───────
      if (!skipDeactivate) {
        const activeInDb = await prisma.product.findMany({
          where: { storeId: store.id, isActive: true },
          select: { id: true, externalId: true, name: true, sku: true }
        })

        const toDeactivate = activeInDb.filter(p => !seenExternalIds.has(p.externalId))

        if (toDeactivate.length > 0) {
          await prisma.product.updateMany({
            where: { id: { in: toDeactivate.map(p => p.id) } },
            data: { isActive: false }
          })
          productsDeactivated = toDeactivate.length
          console.info(
            `[sync:products] Deactivated ${productsDeactivated} products no longer in API:`,
            toDeactivate.map(p => `${p.name} (${p.sku})`).join(', ')
          )
        }
      }

      const totalProcessed = productsCreated + productsUpdated + productsSkipped

      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'success',
          recordsProcessed: totalProcessed,
          recordsCreated: productsCreated,
          recordsUpdated: productsUpdated,
          completedAt: new Date(),
        }
      })

      await prisma.store.update({
        where: { id: store.id },
        data: { lastSyncAt: new Date(), lastSyncStatus: 'success', lastSyncError: null }
      })

      const syncMode = skipDeactivate ? 'incremental' : 'full'
      const parts = []
      if (productsCreated > 0) parts.push(`${productsCreated} mới`)
      if (productsUpdated > 0) parts.push(`${productsUpdated} cập nhật`)
      if (productsSkipped > 0) parts.push(`${productsSkipped} không thay đổi`)
      if (productsDeactivated > 0) parts.push(`${productsDeactivated} đã ẩn`)
      if (skuWarnings.length > 0) parts.push(`${skuWarnings.length} bỏ qua (không có SKU)`)

      return NextResponse.json({
        success: true,
        message: `Đã sync ${totalProcessed} sản phẩm${parts.length ? ` (${parts.join(', ')})` : ''} [${syncMode}]`,
        stats: {
          processed: totalProcessed,
          created: productsCreated,
          updated: productsUpdated,
          skipped: productsSkipped,
          deactivated: productsDeactivated,
          skuWarnings: skuWarnings.length,
          syncMode,
          ...(skuWarnings.length > 0 && { skuWarningDetails: skuWarnings })
        }
      })

    } catch (error: any) {
      if (error instanceof CancelledError) {
        await prisma.syncLog.update({
          where: { id: syncLog.id },
          data: { status: 'cancelled', errorMessage: 'Cancelled by user', completedAt: new Date() }
        })
        await prisma.store.update({
          where: { id: store.id },
          data: { lastSyncStatus: 'cancelled', lastSyncError: 'Cancelled by user' }
        })
        return NextResponse.json({ success: false, cancelled: true, message: 'Sync đã bị dừng' })
      }

      console.error("Product sync error:", error)
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: { status: 'error', errorMessage: error.message, completedAt: new Date() }
      })
      await prisma.store.update({
        where: { id: store.id },
        data: { lastSyncStatus: 'error', lastSyncError: error.message }
      })
      throw error
    }

  } catch (error: any) {
    console.error("Sync products error:", error)
    return NextResponse.json(
      { error: error.message || "An error occurred while syncing products" },
      { status: 500 }
    )
  }
}
