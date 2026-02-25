import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { ShopbaseClient } from "@/lib/integrations/shopbase"
import { WooCommerceClient } from "@/lib/integrations/woocommerce"

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

    // Get store
    const store = await prisma.store.findFirst({
      where: {
        id: storeId,
        userId: session.user.id
      }
    })

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    // Create sync log
    const syncLog = await prisma.syncLog.create({
      data: {
        storeId: store.id,
        syncType: 'products',
        status: 'started',
      }
    })

    // Update store sync status
    await prisma.store.update({
      where: { id: store.id },
      data: {
        lastSyncStatus: 'in_progress',
        lastSyncError: null,
      }
    })

    try {
      let productsCreated = 0
      let productsUpdated = 0
      let totalProcessed = 0

      if (store.platform === 'shopbase') {
        const client = new ShopbaseClient(store.apiUrl, store.apiKey)
        const products = await client.getAllProducts()

        for (const product of products) {
          for (const variant of product.variants) {
            const existingProduct = await prisma.product.findUnique({
              where: {
                storeId_externalId_sku: {
                  storeId: store.id,
                  externalId: variant.id.toString(),
                  sku: variant.sku || `variant-${variant.id}`,
                }
              }
            })

            const productData = {
              name: product.title,
              sku: variant.sku || `variant-${variant.id}`,
              variantName: variant.title !== 'Default Title' ? variant.title : null,
              price: parseFloat(variant.price),
              isActive: true,
            }

            if (existingProduct) {
              await prisma.product.update({
                where: { id: existingProduct.id },
                data: productData,
              })
              productsUpdated++
            } else {
              await prisma.product.create({
                data: {
                  storeId: store.id,
                  externalId: variant.id.toString(),
                  ...productData,
                }
              })
              productsCreated++
            }

            totalProcessed++
          }
        }
      } else if (store.platform === 'woocommerce') {
        if (!store.apiSecret) {
          throw new Error("API Secret is required for WooCommerce")
        }

        const client = new WooCommerceClient(store.apiUrl, store.apiKey, store.apiSecret)
        const products = await client.getAllProducts()

        for (const product of products) {
          // Handle simple products
          if (product.type === 'simple' && product.sku) {
            const existingProduct = await prisma.product.findUnique({
              where: {
                storeId_externalId_sku: {
                  storeId: store.id,
                  externalId: product.id.toString(),
                  sku: product.sku,
                }
              }
            })

            const productData = {
              name: product.name,
              sku: product.sku,
              variantName: null,
              price: parseFloat(product.price),
              isActive: true,
            }

            if (existingProduct) {
              await prisma.product.update({
                where: { id: existingProduct.id },
                data: productData,
              })
              productsUpdated++
            } else {
              await prisma.product.create({
                data: {
                  storeId: store.id,
                  externalId: product.id.toString(),
                  ...productData,
                }
              })
              productsCreated++
            }

            totalProcessed++
          }

          // Handle variable products
          if (product.type === 'variable' && product.variations && product.variations.length > 0) {
            const variations = await client.getProductVariations(product.id)

            for (const variation of variations) {
              if (!variation.sku) continue

              const existingProduct = await prisma.product.findUnique({
                where: {
                  storeId_externalId_sku: {
                    storeId: store.id,
                    externalId: variation.id.toString(),
                    sku: variation.sku,
                  }
                }
              })

              const variantName = variation.attributes
                .map(attr => attr.option)
                .join(' - ')

              const productData = {
                name: product.name,
                sku: variation.sku,
                variantName: variantName || null,
                price: parseFloat(variation.price),
                isActive: true,
              }

              if (existingProduct) {
                await prisma.product.update({
                  where: { id: existingProduct.id },
                  data: productData,
                })
                productsUpdated++
              } else {
                await prisma.product.create({
                  data: {
                    storeId: store.id,
                    externalId: variation.id.toString(),
                    ...productData,
                  }
                })
                productsCreated++
              }

              totalProcessed++
            }
          }
        }
      } else {
        throw new Error("Platform not supported")
      }

      // Update sync log
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

      // Update store
      await prisma.store.update({
        where: { id: store.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: 'success',
          lastSyncError: null,
        }
      })

      return NextResponse.json({
        success: true,
        message: `Synced ${totalProcessed} products (${productsCreated} new, ${productsUpdated} updated)`,
        stats: {
          processed: totalProcessed,
          created: productsCreated,
          updated: productsUpdated,
        }
      })

    } catch (error: any) {
      console.error("Product sync error:", error)

      // Update sync log with error
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'error',
          errorMessage: error.message,
          completedAt: new Date(),
        }
      })

      // Update store
      await prisma.store.update({
        where: { id: store.id },
        data: {
          lastSyncStatus: 'error',
          lastSyncError: error.message,
        }
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
