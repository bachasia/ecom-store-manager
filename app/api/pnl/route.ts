import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { calculateAggregatePL, calculatePLByDate, calculatePLByMonth } from "@/lib/calculations/pnl"
import { getStoreIdsWithPermission, requireStorePermission } from "@/lib/permissions"
import { getUserTimezone, buildDateRangeFilter, buildDateOnlyRangeFilter, utcToLocalYMD } from "@/lib/utils/timezone"

// GET /api/pnl - Get P&L metrics with filters
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get("storeId")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const groupBy = searchParams.get("groupBy") || "total" // total | day | month | country | store | utmSource

    // Build query filters
    const where: any = {}

    let accessibleStores: Array<{ id: string; name: string; platform: string }> = []

    if (storeId) {
      // Verify store access
      const denied = await requireStorePermission(session.user.id, storeId, 'view_dashboard')
      if (denied) return denied

      const store = await prisma.store.findUnique({
        where: { id: storeId },
        select: { id: true, name: true, platform: true },
      })
      if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 })

      where.storeId = storeId
      accessibleStores = [{ id: store.id, name: store.name, platform: store.platform }]
    } else {
      // Get all accessible stores
      const accessibleStoreIds = await getStoreIdsWithPermission(session.user.id, 'view_dashboard')
      const userStores = await prisma.store.findMany({
        where: { id: { in: accessibleStoreIds } },
        select: { id: true, name: true, platform: true },
      })
      where.storeId = { in: userStores.map(s => s.id) }
      accessibleStores = userStores
    }

    // Date filters (inclusive by calendar day in user's timezone)
    const timezone = await getUserTimezone(session.user.id)
    const dateFilter = buildDateRangeFilter(startDate, endDate, timezone)
    if (dateFilter) {
      where.orderDate = dateFilter
    }

    // Include completed + refunded orders
    where.status = {
      in: ['completed', 'processing', 'paid', 'authorized', 'refunded']
    }

    // Fetch orders with necessary data
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
        vendorRefundAmount: true,
        totalCOGS: true,
        transactionFee: true,
        allocatedAdsCost: true,
        grossProfit: true,
        netProfit: true,
        profitMargin: true,
        utmSource: true,
      },
      orderBy: {
        orderDate: 'asc'
      }
    })

    const orderIds = orders.map((o) => o.id)
    const orderItems = orderIds.length > 0
      ? await prisma.orderItem.findMany({
          where: { orderId: { in: orderIds } },
          select: { orderId: true, quantity: true }
        })
      : []

    const itemsByOrderId = new Map<string, number>()
    for (const item of orderItems) {
      itemsByOrderId.set(item.orderId, (itemsByOrderId.get(item.orderId) || 0) + item.quantity)
    }

    const totalItemsSold = Array.from(itemsByOrderId.values()).reduce((sum, qty) => sum + qty, 0)

    // Convert Decimal to number for calculations
    const ordersForCalc = orders.map(order => ({
      id: order.id,
      storeId: order.storeId,
      orderDate: order.orderDate,
      subtotal: Number(order.subtotal),
      shipping: Number(order.shipping),
      total: Number(order.total),
      refundAmount: Number(order.refundAmount),
      vendorRefundAmount: Number(order.vendorRefundAmount),
      totalCOGS: Number(order.totalCOGS),
      transactionFee: Number(order.transactionFee),
      allocatedAdsCost: Number(order.allocatedAdsCost),
    }))

    // Calculate P&L based on groupBy parameter
    let result: any

    if (groupBy === "day") {
      const plByDate = calculatePLByDate(ordersForCalc, timezone)
      const itemsByDate = new Map<string, number>()
      const ordersCountByDate = new Map<string, number>()

      for (const order of orders) {
        const dateKey = utcToLocalYMD(order.orderDate, timezone)
        const qty = itemsByOrderId.get(order.id) || 0
        itemsByDate.set(dateKey, (itemsByDate.get(dateKey) || 0) + qty)
        ordersCountByDate.set(dateKey, (ordersCountByDate.get(dateKey) || 0) + 1)
      }

      result = {
        groupBy: "day",
        data: Array.from(plByDate.entries()).map(([date, metrics]) => ({
          date,
          ...metrics,
          itemsSold: itemsByDate.get(date) || 0,
          ordersCount: ordersCountByDate.get(date) || 0,
          aov: (ordersCountByDate.get(date) || 0) > 0
            ? metrics.revenue / (ordersCountByDate.get(date) || 0)
            : 0,
        }))
      }
    } else if (groupBy === "month") {
      const plByMonth = calculatePLByMonth(ordersForCalc, timezone)
      result = {
        groupBy: "month",
        data: Array.from(plByMonth.entries()).map(([month, metrics]) => ({
          month,
          ...metrics
        }))
      }
    } else if (groupBy === "country") {
      const byCountry = new Map<string, { revenue: number; orderCount: number }>()

      const ordersWithCountry = await prisma.order.findMany({
        where,
        select: {
          customerCountry: true,
          total: true,
          refundAmount: true,
        }
      })

      for (const order of ordersWithCountry) {
        const country = (order.customerCountry || 'Unknown').trim() || 'Unknown'
        const revenue = Number(order.total) - Number(order.refundAmount)
        const existing = byCountry.get(country) || { revenue: 0, orderCount: 0 }
        existing.revenue += revenue
        existing.orderCount += 1
        byCountry.set(country, existing)
      }

      result = {
        groupBy: "country",
        data: Array.from(byCountry.entries())
          .map(([country, metrics]) => ({ country, ...metrics }))
          .sort((a, b) => b.revenue - a.revenue)
      }
    } else if (groupBy === "store") {
      const byStore = new Map<string, typeof ordersForCalc>()

      for (const order of ordersForCalc) {
        const bucket = byStore.get(order.storeId) || []
        bucket.push(order)
        byStore.set(order.storeId, bucket)
      }

      const storeInfoById = new Map(accessibleStores.map((store) => [store.id, { name: store.name, platform: store.platform }]))

      result = {
        groupBy: "store",
        data: Array.from(byStore.entries())
          .map(([id, storeOrders]) => {
            const metrics = calculateAggregatePL(storeOrders)
            const storeInfo = storeInfoById.get(id)
            return {
              storeId: id,
              storeName: storeInfo?.name || "Unknown",
              platform: storeInfo?.platform || "",
              orderCount: storeOrders.length,
              ...metrics,
            }
          })
          .sort((a, b) => b.revenue - a.revenue)
      }
    } else if (groupBy === "utmSource") {
      const byUtmSource = new Map<string, { revenue: number; orderCount: number }>()

      for (const order of orders) {
        const source = (order.utmSource || "Unknown").trim() || "Unknown"
        const revenue = Number(order.total) - Number(order.refundAmount)
        const existing = byUtmSource.get(source) || { revenue: 0, orderCount: 0 }
        existing.revenue += revenue
        existing.orderCount += 1
        byUtmSource.set(source, existing)
      }

      result = {
        groupBy: "utmSource",
        data: Array.from(byUtmSource.entries())
          .map(([utmSource, metrics]) => ({ utmSource, ...metrics }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 10)
      }
    } else {
      // Total aggregate
      const metrics = calculateAggregatePL(ordersForCalc)

      // Query AdsCost trực tiếp để hiện số spend thực tế (không phải allocatedAdsCost)
      const adsWhere: any = {
        storeId: where.storeId,
      }
      const adsDateFilter = buildDateOnlyRangeFilter(startDate, endDate)
      if (adsDateFilter) adsWhere.date = adsDateFilter
      const adsCostRows = await prisma.adsCost.findMany({
        where: adsWhere,
        select: { spend: true },
      })
      const actualAdsCosts = adsCostRows.reduce((sum, r) => sum + Number(r.spend), 0)
      const roundedActualAdsCosts = Math.round(actualAdsCosts * 100) / 100

      // Recalc netProfit / profitMargin / roas dùng actualAdsCosts
      const actualNetProfit = metrics.grossProfit - metrics.transactionFees - roundedActualAdsCosts
      const actualProfitMargin = metrics.revenue > 0 ? (actualNetProfit / metrics.revenue) * 100 : 0
      const actualRoas = roundedActualAdsCosts > 0 ? metrics.revenue / roundedActualAdsCosts : null

      result = {
        groupBy: "total",
        orderCount: orders.length,
        totalItemsSold,
        itemsPerOrder: orders.length > 0 ? totalItemsSold / orders.length : 0,
        aov: orders.length > 0 ? metrics.revenue / orders.length : 0,
        ...metrics,
        // Override với số thực từ AdsCost table
        adsCosts: roundedActualAdsCosts,
        netProfit: Math.round(actualNetProfit * 100) / 100,
        profitMargin: Math.round(actualProfitMargin * 100) / 100,
        roas: actualRoas ? Math.round(actualRoas * 100) / 100 : null,
      }
    }

    return NextResponse.json(result)

  } catch (error: any) {
    console.error("P&L calculation error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to calculate P&L" },
      { status: 500 }
    )
  }
}
