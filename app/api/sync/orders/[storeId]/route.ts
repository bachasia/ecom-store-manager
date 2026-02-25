import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { ShopbaseClient } from "@/lib/integrations/shopbase"
import { WooCommerceClient } from "@/lib/integrations/woocommerce"
import { calculateTransactionFee } from "@/lib/calculations/transaction-fee"

// POST /api/sync/orders/[storeId] - Sync orders from store
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
        syncType: 'orders',
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
      let ordersCreated = 0
      let ordersUpdated = 0
      let totalProcessed = 0

      // Get last sync time for incremental sync
      const lastSyncAt = store.lastSyncAt

      if (store.platform === 'shopbase') {
        const client = new ShopbaseClient(store.apiUrl, store.apiKey)
        
        const params: any = {}
        if (lastSyncAt) {
          params.updatedAtMin = lastSyncAt.toISOString()
        }

        const orders = await client.getAllOrders(params)

        for (const order of orders) {
          const existingOrder = await prisma.order.findUnique({
            where: {
              storeId_externalId: {
                storeId: store.id,
                externalId: order.id.toString(),
              }
            }
          })

          // Calculate totals
          const shippingTotal = order.shipping_lines.reduce(
            (sum, line) => sum + parseFloat(line.price || '0'), 
            0
          )

          const refundTotal = 0 // Shopbase doesn't provide refund info in basic order object

          // Get payment gateway for transaction fee calculation
          const paymentGateway = order.gateway
            ? await prisma.paymentGateway.findFirst({
                where: { 
                  name: order.gateway.toLowerCase(),
                  isActive: true 
                }
              })
            : null

          // Calculate transaction fee
          const transactionFee = calculateTransactionFee(
            parseFloat(order.total_price),
            paymentGateway ? {
              id: paymentGateway.id,
              name: paymentGateway.name,
              displayName: paymentGateway.displayName,
              feePercentage: Number(paymentGateway.feePercentage),
              feeFixed: Number(paymentGateway.feeFixed),
              isActive: paymentGateway.isActive,
            } : null
          )

          // Calculate total COGS from order items
          let totalCOGS = 0
          for (const item of order.line_items) {
            const product = await prisma.product.findFirst({
              where: {
                storeId: store.id,
                sku: item.sku,
              }
            })
            totalCOGS += Number(product?.baseCost || 0) * item.quantity
          }

          const orderData = {
            orderNumber: order.order_number,
            orderDate: new Date(order.created_at),
            status: order.financial_status || 'pending',
            customerEmail: order.customer?.email || null,
            customerName: order.customer 
              ? `${order.customer.first_name} ${order.customer.last_name}`.trim()
              : null,
            customerCountry: order.customer?.default_address?.country || null,
            subtotal: parseFloat(order.subtotal_price),
            discount: parseFloat(order.total_discounts),
            shipping: shippingTotal,
            tax: parseFloat(order.total_tax),
            total: parseFloat(order.total_price),
            refundAmount: refundTotal,
            paymentMethod: order.gateway || null,
            paymentGatewayId: paymentGateway?.id || null,
            transactionFee: transactionFee,
            totalCOGS: totalCOGS,
            utmSource: order.landing_site_ref || null,
          }

          if (existingOrder) {
            await prisma.order.update({
              where: { id: existingOrder.id },
              data: orderData,
            })
            ordersUpdated++
          } else {
            const newOrder = await prisma.order.create({
              data: {
                storeId: store.id,
                externalId: order.id.toString(),
                ...orderData,
              }
            })

            // Create order items
            for (const item of order.line_items) {
              // Find product by SKU
              const product = await prisma.product.findFirst({
                where: {
                  storeId: store.id,
                  sku: item.sku,
                }
              })

              await prisma.orderItem.create({
                data: {
                  orderId: newOrder.id,
                  productId: product?.id || null,
                  sku: item.sku || `item-${item.id}`,
                  productName: item.name,
                  quantity: item.quantity,
                  price: parseFloat(item.price),
                  total: parseFloat(item.price) * item.quantity,
                  unitCost: Number(product?.baseCost || 0),
                  totalCost: Number(product?.baseCost || 0) * item.quantity,
                }
              })
            }

            ordersCreated++
          }

          totalProcessed++
        }

      } else if (store.platform === 'woocommerce') {
        if (!store.apiSecret) {
          throw new Error("API Secret is required for WooCommerce")
        }

        const client = new WooCommerceClient(store.apiUrl, store.apiKey, store.apiSecret)
        
        const params: any = {}
        if (lastSyncAt) {
          params.modifiedAfter = lastSyncAt.toISOString()
        }

        const orders = await client.getAllOrders(params)

        for (const order of orders) {
          const existingOrder = await prisma.order.findUnique({
            where: {
              storeId_externalId: {
                storeId: store.id,
                externalId: order.id.toString(),
              }
            }
          })

          // Calculate refund total
          const refundTotal = order.refunds?.reduce(
            (sum, refund) => sum + Math.abs(parseFloat(refund.total)), 
            0
          ) || 0

          // Get payment gateway for transaction fee calculation
          const paymentGateway = order.payment_method 
            ? await prisma.paymentGateway.findFirst({
                where: { 
                  name: order.payment_method.toLowerCase(),
                  isActive: true 
                }
              })
            : null

          // Calculate transaction fee
          const transactionFee = calculateTransactionFee(
            parseFloat(order.total),
            paymentGateway ? {
              id: paymentGateway.id,
              name: paymentGateway.name,
              displayName: paymentGateway.displayName,
              feePercentage: Number(paymentGateway.feePercentage),
              feeFixed: Number(paymentGateway.feeFixed),
              isActive: paymentGateway.isActive,
            } : null
          )

          // Calculate total COGS from order items
          let totalCOGS = 0
          for (const item of order.line_items) {
            const product = await prisma.product.findFirst({
              where: {
                storeId: store.id,
                sku: item.sku,
              }
            })
            totalCOGS += Number(product?.baseCost || 0) * item.quantity
          }

          const orderData = {
            orderNumber: order.number,
            orderDate: new Date(order.date_created),
            status: order.status,
            customerEmail: order.billing.email || null,
            customerName: `${order.billing.first_name} ${order.billing.last_name}`.trim() || null,
            customerCountry: order.billing.country || null,
            subtotal: parseFloat(order.subtotal),
            discount: parseFloat(order.discount_total),
            shipping: parseFloat(order.shipping_total),
            tax: parseFloat(order.total_tax),
            total: parseFloat(order.total),
            refundAmount: refundTotal,
            paymentMethod: order.payment_method_title || null,
            paymentGatewayId: paymentGateway?.id || null,
            transactionFee: transactionFee,
            totalCOGS: totalCOGS,
          }

          if (existingOrder) {
            await prisma.order.update({
              where: { id: existingOrder.id },
              data: orderData,
            })
            ordersUpdated++
          } else {
            const newOrder = await prisma.order.create({
              data: {
                storeId: store.id,
                externalId: order.id.toString(),
                ...orderData,
              }
            })

            // Create order items
            for (const item of order.line_items) {
              // Find product by SKU
              const product = await prisma.product.findFirst({
                where: {
                  storeId: store.id,
                  sku: item.sku,
                }
              })

              await prisma.orderItem.create({
                data: {
                  orderId: newOrder.id,
                  productId: product?.id || null,
                  sku: item.sku || `item-${item.id}`,
                  productName: item.name,
                  quantity: item.quantity,
                  price: item.price,
                  total: parseFloat(item.total),
                  unitCost: Number(product?.baseCost || 0),
                  totalCost: Number(product?.baseCost || 0) * item.quantity,
                }
              })
            }

            ordersCreated++
          }

          totalProcessed++
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
          recordsCreated: ordersCreated,
          recordsUpdated: ordersUpdated,
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
        message: `Synced ${totalProcessed} orders (${ordersCreated} new, ${ordersUpdated} updated)`,
        stats: {
          processed: totalProcessed,
          created: ordersCreated,
          updated: ordersUpdated,
        }
      })

    } catch (error: any) {
      console.error("Order sync error:", error)

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
    console.error("Sync orders error:", error)
    return NextResponse.json(
      { error: error.message || "An error occurred while syncing orders" },
      { status: 500 }
    )
  }
}
