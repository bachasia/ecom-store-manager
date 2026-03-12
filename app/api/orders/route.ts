import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { calculateOrderPL } from "@/lib/calculations/pnl"
import { getStoreIdsWithPermission, requireStorePermission } from "@/lib/permissions"
import { getUserTimezone, buildDateRangeFilter } from "@/lib/utils/timezone"

// GET /api/orders - List orders with filters
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get("storeId")
    const status = searchParams.get("status")
    const search = searchParams.get("search")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "50")
    const skip = (page - 1) * limit

    // Build query filters
    const where: any = {}

    if (storeId) {
      // Verify user has access to this store
      const denied = await requireStorePermission(session.user.id, storeId, 'view_orders')
      if (denied) return denied

      where.storeId = storeId
    } else {
      // Get all accessible stores
      const accessibleStoreIds = await getStoreIdsWithPermission(session.user.id, 'view_orders')
      where.storeId = { in: accessibleStoreIds }
    }

    // Status filter
    if (status) {
      where.status = status
    }

    // Date range filter (inclusive by calendar day in user's timezone)
    const timezone = await getUserTimezone(session.user.id)
    const dateFilter = buildDateRangeFilter(startDate, endDate, timezone)
    if (dateFilter) {
      where.orderDate = dateFilter
    }

    // Search filter
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customerEmail: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Get total count
    const total = await prisma.order.count({ where })

    // Get orders
    const orders = await prisma.order.findMany({
      where,
      include: {
        store: {
          select: {
            id: true,
            name: true,
            platform: true,
          }
        },
        paymentGateway: {
          select: {
            id: true,
            displayName: true,
          }
        },
        _count: {
          select: {
            orderItems: true
          }
        }
      },
      orderBy: {
        orderDate: 'desc'
      },
      skip,
      take: limit,
    })

    // Calculate profit/margin live from raw fields so the list always reflects
    // the latest COGS and transaction fee data without requiring a manual recalculate.
    // allocatedAdsCost is still read from DB (populated by recalculate).
    const ordersWithPL = orders.map(order => {
      const { grossProfit, netProfit, profitMargin } = calculateOrderPL({
        id: order.id,
        subtotal: Number(order.subtotal),
        shipping: Number(order.shipping),
        total: Number(order.total),
        refundAmount: Number(order.refundAmount),
        vendorRefundAmount: Number((order as any).vendorRefundAmount ?? 0),
        totalCOGS: Number(order.totalCOGS),
        transactionFee: Number(order.transactionFee),
        allocatedAdsCost: Number(order.allocatedAdsCost),
      })
      return {
        ...order,
        grossProfit,
        netProfit,
        profitMargin,
      }
    })

    return NextResponse.json({
      orders: ordersWithPL,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })

  } catch (error: any) {
    console.error("Get orders error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to get orders" },
      { status: 500 }
    )
  }
}
