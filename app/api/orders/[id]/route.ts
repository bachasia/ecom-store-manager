import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { requireStorePermission } from "@/lib/permissions"
import { calculateOrderPL } from "@/lib/calculations/pnl"

// GET /api/orders/[id] - Get order detail with P&L breakdown
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const order = await prisma.order.findUnique({
      where: { id },
      select: { storeId: true }
    })
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    const denied = await requireStorePermission(session.user.id, order.storeId, 'view_orders')
    if (denied) return denied

    const fullOrder = await prisma.order.findUnique({
      where: { id },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            currency: true,
          }
        },
        paymentGateway: {
          select: {
            id: true,
            name: true,
            displayName: true,
            feePercentage: true,
            feeFixed: true,
          }
        },
        orderItems: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                baseCost: true,
              }
            }
          }
        }
      }
    })

    if (!fullOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // Calculate P&L breakdown using the shared engine
    const gmv = Number(fullOrder.subtotal) + Number(fullOrder.shipping)
    const customerRefund = Number(fullOrder.refundAmount)
    const vendorRefund = Number(fullOrder.vendorRefundAmount)
    const revenue = gmv - customerRefund
    const cogs = Number(fullOrder.totalCOGS)
    const netCOGS = cogs - vendorRefund
    const grossProfit = revenue - netCOGS
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
    const transactionFee = Number(fullOrder.transactionFee)
    const adsCost = Number(fullOrder.allocatedAdsCost)
    const netProfit = grossProfit - transactionFee - adsCost
    const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0

    const plBreakdown = {
      gmv: Math.round(gmv * 100) / 100,
      customerRefund: Math.round(customerRefund * 100) / 100,
      vendorRefund: Math.round(vendorRefund * 100) / 100,
      revenue: Math.round(revenue * 100) / 100,
      cogs: Math.round(cogs * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossMargin: Math.round(grossMargin * 100) / 100,
      transactionFee: Math.round(transactionFee * 100) / 100,
      adsCost: Math.round(adsCost * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
    }

    return NextResponse.json({
      order: fullOrder,
      plBreakdown
    })

  } catch (error: any) {
    console.error("Get order error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to get order" },
      { status: 500 }
    )
  }
}

// PATCH /api/orders/[id] - Update vendorRefundAmount and recalculate P&L
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()

    // Validate
    const vendorRefundAmount = parseFloat(body.vendorRefundAmount)
    if (isNaN(vendorRefundAmount) || vendorRefundAmount < 0) {
      return NextResponse.json({ error: "Invalid vendorRefundAmount" }, { status: 400 })
    }

    // Load order to check permission and get financial fields
    const existingOrder = await prisma.order.findUnique({
      where: { id },
      select: {
        storeId: true,
        subtotal: true,
        shipping: true,
        total: true,
        refundAmount: true,
        totalCOGS: true,
        transactionFee: true,
        allocatedAdsCost: true,
      }
    })
    if (!existingOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    const denied = await requireStorePermission(session.user.id, existingOrder.storeId, 'view_orders')
    if (denied) return denied

    // Recalculate P&L with new vendorRefundAmount
    const pl = calculateOrderPL({
      id,
      subtotal: Number(existingOrder.subtotal),
      shipping: Number(existingOrder.shipping),
      total: Number(existingOrder.total),
      refundAmount: Number(existingOrder.refundAmount),
      vendorRefundAmount,
      totalCOGS: Number(existingOrder.totalCOGS),
      transactionFee: Number(existingOrder.transactionFee),
      allocatedAdsCost: Number(existingOrder.allocatedAdsCost),
    })

    // Save to DB
    const updated = await prisma.order.update({
      where: { id },
      data: {
        vendorRefundAmount,
        grossProfit: pl.grossProfit,
        netProfit: pl.netProfit,
        profitMargin: pl.profitMargin,
      },
      select: {
        id: true,
        vendorRefundAmount: true,
        grossProfit: true,
        netProfit: true,
        profitMargin: true,
      }
    })

    return NextResponse.json({ success: true, order: updated, pl })

  } catch (error: any) {
    console.error("Patch order error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to update order" },
      { status: 500 }
    )
  }
}
