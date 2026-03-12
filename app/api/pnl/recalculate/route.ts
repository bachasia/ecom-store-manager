import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { calculateOrderPL } from "@/lib/calculations/pnl"
import { allocateAdsCosts } from "@/lib/calculations/ads-allocation"
import { requireStorePermission, getStoreIdsWithPermission } from "@/lib/permissions"
import { getUserTimezone } from "@/lib/utils/timezone"

// POST /api/pnl/recalculate - Recalculate P&L for all orders
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { storeId, allocationMethod = "revenue-weighted" } = body
    const timezone = await getUserTimezone(session.user.id)

    // Build query filters
    const where: any = {}

    if (storeId) {
      // Verify manage_store permission on the specified store
      const denied = await requireStorePermission(session.user.id, storeId, 'manage_store')
      if (denied) return denied

      where.storeId = storeId
    } else {
      // Get all stores where user has manage_store permission
      const accessibleIds = await getStoreIdsWithPermission(session.user.id, 'manage_store')

      where.storeId = {
        in: accessibleIds
      }
    }

    // Fetch all orders
    const orders = await prisma.order.findMany({
      where,
      select: {
        id: true,
        storeId: true,
        orderDate: true,
        subtotal: true,
        shipping: true,
        total: true,
        refundAmount: true,
        totalCOGS: true,
        transactionFee: true,
        allocatedAdsCost: true,
      }
    })

    if (orders.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No orders to recalculate",
        ordersUpdated: 0
      })
    }

    // Fetch ads costs for allocation
    const storeIds = [...new Set(orders.map(o => o.storeId))]
    const adsCosts = await prisma.adsCost.findMany({
      where: {
        storeId: {
          in: storeIds
        }
      },
      select: {
        id: true,
        storeId: true,
        date: true,
        platform: true,
        campaignName: true,
        adsetName: true,
        spend: true,
      }
    })

    // Allocate ads costs to orders
    const ordersWithAllocatedAds = allocateAdsCosts(
      orders.map(o => ({
        ...o,
        total: Number(o.total),
        refundAmount: Number(o.refundAmount),
        totalCOGS: Number(o.totalCOGS),
        transactionFee: Number(o.transactionFee),
        allocatedAdsCost: Number(o.allocatedAdsCost),
      })),
      adsCosts.map(a => ({
        ...a,
        spend: Number(a.spend),
      })),
      allocationMethod as any,
      timezone
    )

    // Build a lookup map for O(1) access instead of O(n) find per order
    const ordersById = new Map(orders.map(o => [o.id, o]))

    // Build all updates in memory, then flush in a single transaction
    const updates = ordersWithAllocatedAds.flatMap(allocatedOrder => {
      const originalOrder = ordersById.get(allocatedOrder.id)
      if (!originalOrder) return []

      const pl = calculateOrderPL({
        id: allocatedOrder.id,
        subtotal: Number(originalOrder.subtotal),
        shipping: Number(originalOrder.shipping),
        total: Number(originalOrder.total),
        refundAmount: Number(originalOrder.refundAmount),
        vendorRefundAmount: Number((originalOrder as any).vendorRefundAmount ?? 0),
        totalCOGS: Number(originalOrder.totalCOGS),
        transactionFee: Number(originalOrder.transactionFee),
        allocatedAdsCost: allocatedOrder.allocatedAdsCost || 0,
      })

      return [prisma.order.update({
        where: { id: allocatedOrder.id },
        data: {
          allocatedAdsCost: allocatedOrder.allocatedAdsCost || 0,
          grossProfit: pl.grossProfit,
          netProfit: pl.netProfit,
          profitMargin: pl.profitMargin,
        }
      })]
    })

    // Chunk thành batch 500 để tránh OOM với store lớn
    const BATCH_SIZE = 500
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      await prisma.$transaction(updates.slice(i, i + BATCH_SIZE))
    }
    const ordersUpdated = updates.length

    return NextResponse.json({
      success: true,
      message: `Recalculated P&L for ${ordersUpdated} orders`,
      ordersUpdated,
      allocationMethod,
    })

  } catch (error: any) {
    console.error("P&L recalculation error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to recalculate P&L" },
      { status: 500 }
    )
  }
}
