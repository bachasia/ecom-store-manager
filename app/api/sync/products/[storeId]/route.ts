import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { ShopbaseClient } from "@/lib/integrations/shopbase"
import { WooCommerceClient } from "@/lib/integrations/woocommerce"
import { WcPluginClient, PluginProduct } from "@/lib/integrations/wc-plugin"

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

    // Internal cron call — bypass session auth
    const cronSecret = process.env.CRON_SECRET
    const isCronCall = cronSecret && req.headers.get("x-cron-internal") === cronSecret

    const session = isCronCall ? null : await getServerSession(authOptions)

    if (!isCronCall && !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const store = await prisma.store.findFirst({
      where: isCronCall
        ? { id: storeId, isActive: true, autoSyncEnabled: true }
        : { id: storeId, userId: session!.user!.id }
    }) as any  // cast to any — pluginSecret field exists at runtime

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

    let productsCreated = 0
    let productsUpdated = 0
    let productsSkipped = 0
    let productsDeactivated = 0
    let skuWarnings: string[] = []
    let skipDeactivate = false  // true khi incremental sync — không biết product nào bị xóa

    try {

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
        hasSkuWarning?: boolean  // true nếu SKU được sinh tự động
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

        const hasSkuWarning = data.hasSkuWarning ?? false

        if (existing) {
          const priceChanged = parseFloat(existing.price.toString()) !== data.price
          const nameChanged = existing.name !== data.name
          const variantChanged = (existing.variantName ?? null) !== (data.variantName ?? null)
          const imageChanged = (existing.imageUrl ?? null) !== (data.imageUrl ?? null)
          const parentChanged = (existing.parentExternalId ?? null) !== (data.parentExternalId ?? null)
          const wasInactive = !existing.isActive
          const warningChanged = existing.hasSkuWarning !== hasSkuWarning

          if (priceChanged || nameChanged || variantChanged || imageChanged || parentChanged || wasInactive || warningChanged) {
            await prisma.product.update({
              where: { id: existing.id },
              data: {
                name: data.name,
                variantName: data.variantName,
                parentExternalId: data.parentExternalId ?? null,
                price: data.price,
                imageUrl: data.imageUrl ?? null,
                isActive: true,
                hasSkuWarning,
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
              hasSkuWarning,
            }
          })
          productsCreated++
        }
      }

      // ─── ShopBase ────────────────────────────────────────────────────────
      if (store.platform === 'shopbase') {
        if (!store.apiSecret) throw new Error('API Password is required for ShopBase')

        const client = new ShopbaseClient(store.apiUrl, store.apiKey, store.apiSecret)

        // Incremental: dùng lastProductAutoSyncAt để skip products không đổi.
        // ShopBase API không hỗ trợ updated_at_min cho products nên vẫn fetch
        // tất cả pages nhưng bỏ qua ở client-side dựa trên product.updated_at.
        const searchParams = new URL(req.url).searchParams
        const forceFull = ["1", "true", "yes"].includes((searchParams.get("full") || "").toLowerCase())
        const existingProductCount = await prisma.product.count({ where: { storeId: store.id } })
        const sinceDate = (forceFull || existingProductCount === 0)
          ? undefined
          : (store.lastProductAutoSyncAt ? new Date(store.lastProductAutoSyncAt) : undefined)

        if (sinceDate) {
          skipDeactivate = true // incremental — không biết product nào bị xóa
          console.info(`[sync:products][shopbase] incremental mode since=${sinceDate.toISOString()}`)
        } else {
          console.info(`[sync:products][shopbase] full sync mode`)
        }

        // Stream từng trang thay vì load tất cả vào RAM (tránh OOM và timeout)
        const { totalFetched, totalSkipped } = await client.streamAllProducts({
          sinceDate,
          onPage: async (products, { page, fetched, skipped }) => {
            console.info(`[sync:products][shopbase] page=${page} fetched=${fetched} api_skipped=${skipped} db_written=${productsCreated + productsUpdated + productsSkipped}`)

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
          },
          onProgress: (fetched) => {
            console.info(`[sync:products][shopbase] total fetched=${fetched}`)
          },
        })
        console.info(`[sync:products][shopbase] done totalFetched=${totalFetched} totalSkipped=${totalSkipped}`)

      // ─── WooCommerce ─────────────────────────────────────────────────────
      } else if (store.platform === 'woocommerce') {

        // Dùng syncLog riêng cho products — không bị ảnh hưởng bởi order sync
        const lastProductSyncLog = await prisma.syncLog.findFirst({
          where: {
            storeId: store.id,
            syncType: 'products',
            status: 'success',
            completedAt: { not: null },
          },
          orderBy: { completedAt: 'desc' },
          select: { completedAt: true }
        })

        const existingProductCount = await prisma.product.count({ where: { storeId: store.id } })
        const forceFull = ["1", "true", "yes"].includes(
          (new URL(req.url).searchParams.get("full") || "").toLowerCase()
        )

        const isIncremental = !forceFull && existingProductCount > 0 && !!lastProductSyncLog?.completedAt
        const modifiedAfter = isIncremental
          ? lastProductSyncLog!.completedAt!.toISOString()
          : undefined

        const syncStartTime = Date.now()

        if (isIncremental) {
          console.info(`[sync:products] WooCommerce incremental sync — modified_after=${modifiedAfter}`)
        } else {
          console.info('[sync:products] WooCommerce full sync')
        }

        // ── Helper: upsert product từ plugin format (đã có inline variations) ──
        const upsertFromPlugin = async (product: PluginProduct) => {
          if (await isCancelled()) throw new CancelledError()
          const productImageUrl = product.image_url ?? null

          if (product.type === 'simple') {
            const hasOriginalSku = !!product.sku?.trim()
            const sku = hasOriginalSku ? product.sku.trim() : `wc-${product.id}`
            if (!hasOriginalSku) skuWarnings.push(`"${product.name}" (id=${product.id}) → ${sku}`)
            await upsertProduct({ externalId: product.id.toString(), parentExternalId: null, sku, name: product.name, variantName: null, price: parseFloat(product.price) || 0, imageUrl: productImageUrl, hasSkuWarning: !hasOriginalSku })

          } else if (product.type === 'variable') {
            for (const variation of product.variations) {
              const hasOriginalSku = !!variation.sku?.trim()
              const sku = hasOriginalSku ? variation.sku.trim() : `wc-var-${variation.id}`
              if (!hasOriginalSku) skuWarnings.push(`"${product.name}" variation id=${variation.id} → ${sku}`)
              const variantName = variation.attributes.length > 0 ? variation.attributes.map(a => a.option).join(' / ') : null
              await upsertProduct({ externalId: variation.id.toString(), parentExternalId: product.id.toString(), sku, name: product.name, variantName, price: parseFloat(variation.price) || 0, imageUrl: variation.image_url ?? productImageUrl, hasSkuWarning: !hasOriginalSku })
            }
          }
        }

        if (store.pluginSecret) {
          // ── Plugin fast path: bulk export, 1 request per page, inline variations ──
          console.info('[sync:products] Using PNL Sync Plugin — fast path')
          const pluginClient = new WcPluginClient(store.apiUrl, store.pluginSecret)

          await pluginClient.streamProducts({
            modifiedAfter,
            perPage: 100,  // 100 products/page — balance giữa số request và timeout risk
            onPage: async (products, pageInfo) => {
              const dbWritten = productsCreated + productsUpdated + productsSkipped
              console.info(`[sync:products][plugin] page=${pageInfo.page}/${pageInfo.totalPages} products=${products.length} db_written=${dbWritten}`)
              for (const product of products) {
                await upsertFromPlugin(product)
              }
            },
            onProgress: (fetched, total) => {
              console.info(`[sync:products][plugin] fetched=${fetched}/${total}`)
            },
          })

        } else {
          // ── WooCommerce REST API fallback ────────────────────────────────────
          if (!store.apiSecret) throw new Error('API Secret is required for WooCommerce')
          console.info('[sync:products] Using WooCommerce REST API (install PNL Plugin for faster sync)')
          const client = new WooCommerceClient(store.apiUrl, store.apiKey, store.apiSecret)

          const { simpleCount, variableCount, errorCount: fetchErrors } = await client.streamAllProducts({
          modifiedAfter,
          variationConcurrency: 3,
          onProgress: ({ pagesFetched, simpleProcessed, variableProcessed, variableTotal }) => {
            const dbWritten = productsCreated + productsUpdated + productsSkipped
            console.info(
              `[sync:products] pages=${pagesFetched} ` +
              `simple=${simpleProcessed} variable=${variableProcessed}/${variableTotal} ` +
              `db_written=${dbWritten}`
            )
          },
          onProduct: async (product, variations) => {
            if (await isCancelled()) throw new CancelledError()

            const productImageUrl = product.images?.[0]?.src ?? null

            if (product.type === 'simple') {
              const hasOriginalSku = !!product.sku?.trim()
              const sku = hasOriginalSku ? product.sku!.trim() : `wc-${product.id}`

              if (!hasOriginalSku) {
                console.warn(`[sync:products] No SKU: "${product.name}" (id=${product.id}) → auto: ${sku}`)
                skuWarnings.push(`"${product.name}" (id=${product.id}) → ${sku}`)
              }

              await upsertProduct({
                externalId: product.id.toString(),
                parentExternalId: null,
                sku,
                name: product.name,
                variantName: null,
                price: parseFloat(product.price) || 0,
                imageUrl: productImageUrl,
                hasSkuWarning: !hasOriginalSku,
              })

            } else if (product.type === 'variable') {
              if (variations.length === 0 && (!product.variations || product.variations.length === 0)) return

              for (const variation of variations) {
                const hasOriginalSku = !!variation.sku?.trim()
                const sku = hasOriginalSku ? variation.sku!.trim() : `wc-var-${variation.id}`

                if (!hasOriginalSku) {
                  console.warn(`[sync:products] No SKU: "${product.name}" variation id=${variation.id} → auto: ${sku}`)
                  skuWarnings.push(`"${product.name}" variation id=${variation.id} → ${sku}`)
                }

                const variantName = variation.attributes.length > 0
                  ? variation.attributes.map(a => a.option).join(' / ')
                  : null

                const imageUrl = variation.image?.src ?? productImageUrl

                await upsertProduct({
                  externalId: variation.id.toString(),
                  parentExternalId: product.id.toString(),
                  sku,
                  name: product.name,
                  variantName,
                  price: parseFloat(variation.price) || 0,
                  imageUrl,
                  hasSkuWarning: !hasOriginalSku,
                })
              }
            }
            // grouped, external: bỏ qua
          },
        })

          console.info(
            `[sync:products] Stream done in ${((Date.now() - syncStartTime) / 1000).toFixed(1)}s — ` +
            `simple=${simpleCount} variable=${variableCount} fetchErrors=${fetchErrors}`
          )
        } // end REST API else

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
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: 'success',
          lastSyncError: null,
          lastProductAutoSyncAt: new Date(),
        }
      })

      const syncMode = skipDeactivate ? 'incremental' : 'full'
      const parts = []
      if (productsCreated > 0) parts.push(`${productsCreated} mới`)
      if (productsUpdated > 0) parts.push(`${productsUpdated} cập nhật`)
      if (productsSkipped > 0) parts.push(`${productsSkipped} không thay đổi`)
      if (productsDeactivated > 0) parts.push(`${productsDeactivated} đã ẩn`)
      if (skuWarnings.length > 0) parts.push(`${skuWarnings.length} sinh SKU tự động (thiếu SKU gốc)`)

      return NextResponse.json({
        success: true,
        message: `Đã sync ${totalProcessed} sản phẩm${parts.length ? ` (${parts.join(', ')})` : ''} [${syncMode}]`,
        stats: {
          processed: totalProcessed,
          created: productsCreated,
          updated: productsUpdated,
          skipped: productsSkipped,
          deactivated: productsDeactivated,
          autoSkuCount: skuWarnings.length,
          syncMode,
          ...(skuWarnings.length > 0 && { autoSkuDetails: skuWarnings })
        }
      })

    } catch (error: any) {
      if (error instanceof CancelledError) {
        const totalProcessedSoFar = productsCreated + productsUpdated + productsSkipped
        if (syncLog) {
          await prisma.syncLog.update({
            where: { id: syncLog.id },
            data: {
              status: 'cancelled',
              errorMessage: 'Cancelled by user',
              completedAt: new Date(),
              recordsProcessed: totalProcessedSoFar,
              recordsCreated: productsCreated,
              recordsUpdated: productsUpdated,
            }
          })
        }
        await prisma.store.update({
          where: { id: store.id },
          data: { lastSyncStatus: 'cancelled', lastSyncError: 'Cancelled by user' }
        })
        return NextResponse.json({ success: false, cancelled: true, message: `Sync đã bị dừng (đã xử lý ${totalProcessedSoFar} sản phẩm)` })
      }

      console.error("Product sync error:", error)
      if (syncLog) {
        await prisma.syncLog.update({
          where: { id: syncLog.id },
          data: { status: 'error', errorMessage: error.message, completedAt: new Date() }
        })
      }
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
