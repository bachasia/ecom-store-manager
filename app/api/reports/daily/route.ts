import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"

// GET /api/reports/daily
// Params: storeId?, startDate, endDate, drilldown? (true = include per-store breakdown per day)
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
    // drilldown=true means include per-store breakdown inside each day row
    const drilldown = searchParams.get("drilldown") === "true"
    // date=YYYY-MM-DD: when set, return only that specific day (used by on-demand drilldown)
    const singleDate = searchParams.get("date")

    // --- Resolve accessible store IDs ---
    let storeIds: string[] = []
    const storeMap = new Map<string, { name: string; platform: string }>()

    if (storeId) {
      const store = await prisma.store.findFirst({
        where: { id: storeId, userId: session.user.id },
        select: { id: true, name: true, platform: true },
      })
      if (!store) {
        return NextResponse.json({ error: "Store not found" }, { status: 404 })
      }
      storeIds = [store.id]
      storeMap.set(store.id, { name: store.name, platform: store.platform })
    } else {
      const userStores = await prisma.store.findMany({
        where: { userId: session.user.id },
        select: { id: true, name: true, platform: true },
      })
      storeIds = userStores.map((s) => s.id)
      userStores.forEach((s) =>
        storeMap.set(s.id, { name: s.name, platform: s.platform })
      )
    }

    if (storeIds.length === 0) {
      return NextResponse.json({ days: [] })
    }

    // --- Build order filter ---
    const orderWhere: any = {
      storeId: { in: storeIds },
      status: { in: ["completed", "processing", "paid", "authorized"] },
    }
    // singleDate overrides startDate/endDate — fetch exactly one calendar day
    if (singleDate) {
      const dayStart = new Date(`${singleDate}T00:00:00.000Z`)
      const dayEnd = new Date(`${singleDate}T00:00:00.000Z`)
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)
      orderWhere.orderDate = { gte: dayStart, lt: dayEnd }
    } else if (startDate || endDate) {
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
        id: true,
        storeId: true,
        orderDate: true,
        total: true,
        refundAmount: true,
        totalCOGS: true,
        transactionFee: true,
        allocatedAdsCost: true,
        grossProfit: true,
        netProfit: true,
        profitMargin: true,
      },
      orderBy: { orderDate: "asc" },
    })

    // --- Aggregate by date (and optionally by date+store) ---
    type DayKey = string // "YYYY-MM-DD"
    type StoreKey = string

    interface DayMetrics {
      date: string
      orders: number
      revenue: number
      cogs: number
      adsCost: number
      transactionFees: number
      grossProfit: number
      netProfit: number
    }

    interface StoreMetrics extends DayMetrics {
      storeId: string
      storeName: string
      platform: string
    }

    const dayMap = new Map<DayKey, DayMetrics>()
    // drilldown: indexed by date → storeId → StoreMetrics (O(1) lookup, not O(n²) filter)
    const dayStoreIndex = new Map<DayKey, Map<StoreKey, StoreMetrics>>()
    const dayStoreMap = new Map<string, StoreMetrics>() // key: "date::storeId"

    for (const order of orders) {
      const date = order.orderDate.toISOString().split("T")[0]
      const revenue = Number(order.total) - Number(order.refundAmount)
      const cogs = Number(order.totalCOGS)
      const adsCost = Number(order.allocatedAdsCost)
      const txFees = Number(order.transactionFee)
      const gross = Number(order.grossProfit)
      const net = Number(order.netProfit)

      // --- Day aggregate ---
      const day = dayMap.get(date) || {
        date,
        orders: 0,
        revenue: 0,
        cogs: 0,
        adsCost: 0,
        transactionFees: 0,
        grossProfit: 0,
        netProfit: 0,
      }
      day.orders += 1
      day.revenue += revenue
      day.cogs += cogs
      day.adsCost += adsCost
      day.transactionFees += txFees
      day.grossProfit += gross
      day.netProfit += net
      dayMap.set(date, day)

      // --- Per-store drilldown ---
      if (drilldown) {
        if (!dayStoreIndex.has(date)) dayStoreIndex.set(date, new Map())
        const storeMapForDay = dayStoreIndex.get(date)!
        const ds = storeMapForDay.get(order.storeId) || {
          date,
          storeId: order.storeId,
          storeName: storeMap.get(order.storeId)?.name ?? "Unknown",
          platform: storeMap.get(order.storeId)?.platform ?? "",
          orders: 0,
          revenue: 0,
          cogs: 0,
          adsCost: 0,
          transactionFees: 0,
          grossProfit: 0,
          netProfit: 0,
        }
        ds.orders += 1
        ds.revenue += revenue
        ds.cogs += cogs
        ds.adsCost += adsCost
        ds.transactionFees += txFees
        ds.grossProfit += gross
        ds.netProfit += net
        storeMapForDay.set(order.storeId, ds)
      }
    }

    // --- Build response ---
    const days = Array.from(dayMap.values())
      .map((day) => {
        const profitMargin =
          day.revenue > 0 ? (day.netProfit / day.revenue) * 100 : 0
        const roas = day.adsCost > 0 ? day.revenue / day.adsCost : null

        const result: any = {
          date: day.date,
          orders: day.orders,
          revenue: Math.round(day.revenue * 100) / 100,
          cogs: Math.round(day.cogs * 100) / 100,
          adsCost: Math.round(day.adsCost * 100) / 100,
          transactionFees: Math.round(day.transactionFees * 100) / 100,
          grossProfit: Math.round(day.grossProfit * 100) / 100,
          netProfit: Math.round(day.netProfit * 100) / 100,
          profitMargin: Math.round(profitMargin * 100) / 100,
          roas: roas !== null ? Math.round(roas * 100) / 100 : null,
        }

        if (drilldown) {
          // O(1) lookup via dayStoreIndex instead of O(n) filter over all entries
          const storeBreakdown = Array.from(dayStoreIndex.get(day.date)?.values() ?? [])
            .map((ds) => {
              const storeMargin =
                ds.revenue > 0 ? (ds.netProfit / ds.revenue) * 100 : 0
              const storeRoas =
                ds.adsCost > 0 ? ds.revenue / ds.adsCost : null
              return {
                storeId: ds.storeId,
                storeName: ds.storeName,
                platform: ds.platform,
                orders: ds.orders,
                revenue: Math.round(ds.revenue * 100) / 100,
                cogs: Math.round(ds.cogs * 100) / 100,
                adsCost: Math.round(ds.adsCost * 100) / 100,
                transactionFees: Math.round(ds.transactionFees * 100) / 100,
                grossProfit: Math.round(ds.grossProfit * 100) / 100,
                netProfit: Math.round(ds.netProfit * 100) / 100,
                profitMargin: Math.round(storeMargin * 100) / 100,
                roas:
                  storeRoas !== null
                    ? Math.round(storeRoas * 100) / 100
                    : null,
              }
            })
            .sort((a, b) => b.revenue - a.revenue)
          result.stores = storeBreakdown
        }

        return result
      })
      .sort((a, b) => b.date.localeCompare(a.date)) // Most recent first

    return NextResponse.json({ days })
  } catch (error: any) {
    console.error("Daily report error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to generate daily report" },
      { status: 500 }
    )
  }
}
