import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"

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

    // --- Fetch all user stores ---
    const userStores = await prisma.store.findMany({
      where: { userId: session.user.id },
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
    const orderWhere: any = {
      storeId: { in: storeIds },
      status: { in: ["completed", "processing", "paid", "authorized"] },
    }
    if (startDate || endDate) {
      orderWhere.orderDate = {}
      if (startDate) {
        orderWhere.orderDate.gte = new Date(`${startDate}T00:00:00.000Z`)
      }
      if (endDate) {
        const endExclusive = new Date(`${endDate}T00:00:00.000Z`)
        endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
        orderWhere.orderDate.lt = endExclusive
      }
    }

    // --- Query orders ---
    const orders = await prisma.order.findMany({
      where: orderWhere,
      select: {
        storeId: true,
        orderDate: true,
        total: true,
        refundAmount: true,
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
        revenue: 0,
        cogs: 0,
        adsCost: 0,
        transactionFees: 0,
        grossProfit: 0,
        netProfit: 0,
      }
      agg.orders += 1
      agg.revenue += Number(order.total) - Number(order.refundAmount)
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
        const periodKey =
          groupBy === "day"
            ? order.orderDate.toISOString().split("T")[0]
            : order.orderDate.toISOString().substring(0, 7)

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
          Number(order.total) - Number(order.refundAmount)
        storeMetrics.netProfit += Number(order.netProfit)
        storeMetrics.adsCost += Number(order.allocatedAdsCost)
        periodStores.set(order.storeId, storeMetrics)
      }

      trends = Array.from(trendMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, storesData]) => {
          const storesObj: Record<
            string,
            { revenue: number; netProfit: number; roas: number | null }
          > = {}
          for (const [sid, metrics] of storesData.entries()) {
            const roas =
              metrics.adsCost > 0 ? metrics.revenue / metrics.adsCost : null
            storesObj[sid] = {
              revenue: Math.round(metrics.revenue * 100) / 100,
              netProfit: Math.round(metrics.netProfit * 100) / 100,
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
