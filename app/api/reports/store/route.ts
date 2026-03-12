import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { getStoreIdsWithPermission } from "@/lib/permissions"
import { getUserTimezone, buildDateRangeFilter, utcToLocalYMD } from "@/lib/utils/timezone"

// GET /api/reports/store
// Params: startDate, endDate, groupBy=total|day|month
// Returns:
//   comparison: per-store aggregate metrics
//   trends: time-series per store (only when groupBy=day|month)
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const groupBy = searchParams.get("groupBy") || "total" // total | day | month

    // --- Fetch accessible stores ---
    const accessibleStoreIds = await getStoreIdsWithPermission(session.user.id, 'view_dashboard')
    const userStores = await prisma.store.findMany({
      where: { id: { in: accessibleStoreIds } },
      select: { id: true, name: true, platform: true },
    })

    if (userStores.length === 0) {
      return NextResponse.json({ comparison: [], trends: [] })
    }

    const storeIds = userStores.map((s) => s.id)
    const storeMap = new Map(
      userStores.map((s) => [s.id, { name: s.name, platform: s.platform }])
    )

    // --- Build order filter ---
    const timezone = await getUserTimezone(session.user.id)
    const orderWhere: any = {
      storeId: { in: storeIds },
      status: { in: ["completed", "processing", "paid", "authorized", "refunded"] },
    }
    const dateFilter = buildDateRangeFilter(startDate, endDate, timezone)
    if (dateFilter) orderWhere.orderDate = dateFilter

    // --- Query orders ---
    const orders = await prisma.order.findMany({
      where: orderWhere,
      select: {
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
      },
      orderBy: { orderDate: "asc" },
    })

    // --- Aggregate per store (comparison) ---
    interface StoreAgg {
      storeId: string
      orders: number
      gmv: number
      customerRefund: number
      vendorRefund: number
      revenue: number
      cogs: number
      adsCost: number
      transactionFees: number
      grossProfit: number
      netProfit: number
    }

    const storeAggMap = new Map<string, StoreAgg>()

    for (const order of orders) {
      const agg = storeAggMap.get(order.storeId) || {
        storeId: order.storeId,
        orders: 0,
        gmv: 0,
        customerRefund: 0,
        vendorRefund: 0,
        revenue: 0,
        cogs: 0,
        adsCost: 0,
        transactionFees: 0,
        grossProfit: 0,
        netProfit: 0,
      }
      const gmv = Number(order.subtotal) + Number(order.shipping)
      const customerRefund = Number(order.refundAmount)
      const vendorRefund = Number(order.vendorRefundAmount ?? 0)
      agg.orders += 1
      agg.gmv += gmv
      agg.customerRefund += customerRefund
      agg.vendorRefund += vendorRefund
      agg.revenue += gmv - customerRefund
      agg.cogs += Number(order.totalCOGS)
      agg.adsCost += Number(order.allocatedAdsCost)
      agg.transactionFees += Number(order.transactionFee)
      agg.grossProfit += Number(order.grossProfit)
      agg.netProfit += Number(order.netProfit)
      storeAggMap.set(order.storeId, agg)
    }

    const comparison = Array.from(storeAggMap.values())
      .map((agg) => {
        const store = storeMap.get(agg.storeId)
        const profitMargin =
          agg.revenue > 0 ? (agg.netProfit / agg.revenue) * 100 : 0
        const roas = agg.adsCost > 0 ? agg.revenue / agg.adsCost : null
        return {
          storeId: agg.storeId,
          storeName: store?.name ?? "Unknown",
          platform: store?.platform ?? "unknown",
          orders: agg.orders,
          gmv: Math.round(agg.gmv * 100) / 100,
          customerRefund: Math.round(agg.customerRefund * 100) / 100,
          vendorRefund: Math.round(agg.vendorRefund * 100) / 100,
          revenue: Math.round(agg.revenue * 100) / 100,
          cogs: Math.round(agg.cogs * 100) / 100,
          adsCost: Math.round(agg.adsCost * 100) / 100,
          transactionFees: Math.round(agg.transactionFees * 100) / 100,
          grossProfit: Math.round(agg.grossProfit * 100) / 100,
          netProfit: Math.round(agg.netProfit * 100) / 100,
          profitMargin: Math.round(profitMargin * 100) / 100,
          roas: roas !== null ? Math.round(roas * 100) / 100 : null,
        }
      })
      .sort((a, b) => b.revenue - a.revenue)

    // --- Build trends (groupBy = day | month) ---
    let trends: any[] = []

    if (groupBy === "day" || groupBy === "month") {
      // Map: periodKey → storeId → metrics
      const trendMap = new Map<
        string,
        Map<
          string,
          { revenue: number; netProfit: number; adsCost: number }
        >
      >()

      for (const order of orders) {
        const localYMD = utcToLocalYMD(order.orderDate, timezone)
        const periodKey =
          groupBy === "day"
            ? localYMD
            : localYMD.substring(0, 7)

        let periodStores = trendMap.get(periodKey)
        if (!periodStores) {
          periodStores = new Map()
          trendMap.set(periodKey, periodStores)
        }

        const storeMetrics = periodStores.get(order.storeId) || {
          revenue: 0,
          netProfit: 0,
          adsCost: 0,
        }
        storeMetrics.revenue +=
          (Number(order.subtotal) + Number(order.shipping)) - Number(order.refundAmount)
        storeMetrics.netProfit += Number(order.netProfit)
        storeMetrics.adsCost += Number(order.allocatedAdsCost)
        periodStores.set(order.storeId, storeMetrics)
      }

      trends = Array.from(trendMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, storesData]) => {
          const storesObj: Record<
            string,
            { revenue: number; netProfit: number; adsCost: number; roas: number | null }
          > = {}
          for (const [sid, metrics] of storesData.entries()) {
            const roas =
              metrics.adsCost > 0 ? metrics.revenue / metrics.adsCost : null
            storesObj[sid] = {
              revenue: Math.round(metrics.revenue * 100) / 100,
              netProfit: Math.round(metrics.netProfit * 100) / 100,
              adsCost: Math.round(metrics.adsCost * 100) / 100,
              roas: roas !== null ? Math.round(roas * 100) / 100 : null,
            }
          }
          return { date: period, stores: storesObj }
        })
    }

    return NextResponse.json({
      comparison,
      trends,
      // Pass store metadata so client can render legends without extra fetches
      stores: userStores.map((s) => ({
        id: s.id,
        name: s.name,
        platform: s.platform,
      })),
    })
  } catch (error: any) {
    console.error("Store report error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to generate store report" },
      { status: 500 }
    )
  }
}
