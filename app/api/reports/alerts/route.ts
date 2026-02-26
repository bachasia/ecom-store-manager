import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"

const ROAS_THRESHOLD_KEY = "roas_threshold"
const DEFAULT_ROAS_THRESHOLD = 1.0

// GET /api/reports/alerts
// Params: storeId?, startDate, endDate
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

    // --- Resolve accessible store IDs ---
    let storeIds: string[] = []
    let storeMap = new Map<string, { name: string; platform: string }>()

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
      return NextResponse.json({
        negativeROI: [],
        lowROAS: [],
        missingCOGS: [],
        summary: { negativeROIDays: 0, lowROASDays: 0, missingCOGSCount: 0 },
      })
    }

    // --- Fetch ROAS threshold ---
    const thresholdSetting = await prisma.appSetting.findUnique({
      where: { key: `${ROAS_THRESHOLD_KEY}:${session.user.id}` },
    })
    const roasThreshold = thresholdSetting
      ? parseFloat(thresholdSetting.value)
      : DEFAULT_ROAS_THRESHOLD

    // --- Build date filter ---
    const dateFilter: any = {}
    if (startDate) {
      dateFilter.gte = new Date(`${startDate}T00:00:00.000Z`)
    }
    if (endDate) {
      const endExclusive = new Date(`${endDate}T00:00:00.000Z`)
      endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
      dateFilter.lt = endExclusive
    }

    const orderWhere: any = {
      storeId: { in: storeIds },
      status: { in: ["completed", "processing", "paid", "authorized"] },
    }
    if (Object.keys(dateFilter).length > 0) {
      orderWhere.orderDate = dateFilter
    }

    // --- Query all orders in range (for negative ROI & low ROAS) ---
    const orders = await prisma.order.findMany({
      where: orderWhere,
      select: {
        storeId: true,
        orderDate: true,
        total: true,
        refundAmount: true,
        allocatedAdsCost: true,
        netProfit: true,
      },
      orderBy: { orderDate: "asc" },
    })

    // --- Aggregate by (date, storeId) ---
    type DayStoreKey = string // "YYYY-MM-DD::storeId"
    const dayStoreMap = new Map<
      DayStoreKey,
      {
        date: string
        storeId: string
        revenue: number
        adsCost: number
        netProfit: number
      }
    >()

    for (const order of orders) {
      const date = order.orderDate.toISOString().split("T")[0]
      const key = `${date}::${order.storeId}`

      const existing = dayStoreMap.get(key) || {
        date,
        storeId: order.storeId,
        revenue: 0,
        adsCost: 0,
        netProfit: 0,
      }

      existing.revenue += Number(order.total) - Number(order.refundAmount)
      existing.adsCost += Number(order.allocatedAdsCost)
      existing.netProfit += Number(order.netProfit)
      dayStoreMap.set(key, existing)
    }

    const dayStoreEntries = Array.from(dayStoreMap.values())

    // --- 1. Negative ROI days ---
    const negativeROI = dayStoreEntries
      .filter((d) => d.netProfit < 0)
      .map((d) => {
        const store = storeMap.get(d.storeId)
        const roi =
          d.revenue > 0 ? ((d.netProfit / d.revenue) * 100) : -100
        return {
          date: d.date,
          storeId: d.storeId,
          storeName: store?.name ?? "Unknown",
          revenue: Math.round(d.revenue * 100) / 100,
          adsCost: Math.round(d.adsCost * 100) / 100,
          netProfit: Math.round(d.netProfit * 100) / 100,
          roi: Math.round(roi * 100) / 100,
        }
      })
      .sort((a, b) => a.roi - b.roi) // Worst ROI first

    // --- 2. Low ROAS days (only when adsCost > 0) ---
    const lowROAS = dayStoreEntries
      .filter((d) => {
        if (d.adsCost <= 0) return false
        const roas = d.revenue / d.adsCost
        return roas < roasThreshold
      })
      .map((d) => {
        const store = storeMap.get(d.storeId)
        const roas = d.adsCost > 0 ? d.revenue / d.adsCost : 0
        return {
          date: d.date,
          storeId: d.storeId,
          storeName: store?.name ?? "Unknown",
          adsCost: Math.round(d.adsCost * 100) / 100,
          revenue: Math.round(d.revenue * 100) / 100,
          roas: Math.round(roas * 100) / 100,
          threshold: roasThreshold,
        }
      })
      .sort((a, b) => a.roas - b.roas) // Lowest ROAS first

    // --- 3. Missing COGS (products with orders but baseCost = 0 or null) ---
    const adsCostDateFilter: any = {}
    if (startDate) {
      adsCostDateFilter.gte = new Date(`${startDate}T00:00:00.000Z`)
    }
    if (endDate) {
      const endExclusive = new Date(`${endDate}T00:00:00.000Z`)
      endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
      adsCostDateFilter.lt = endExclusive
    }

    // Find products with baseCost = 0 that have OrderItems in this period
    const orderItemsWithMissingCOGS = await prisma.orderItem.findMany({
      where: {
        order: orderWhere,
        product: {
          storeId: { in: storeIds },
          baseCost: { lte: 0 },
        },
      },
      select: {
        sku: true,
        productName: true,
        quantity: true,
        total: true,
        product: {
          select: {
            id: true,
            baseCost: true,
            storeId: true,
          },
        },
      },
    })

    // Aggregate by (productId, sku) — group missing COGS items
    type SkuKey = string // "productId::sku"
    const missingCOGSMap = new Map<
      SkuKey,
      {
        productId: string
        sku: string
        productName: string
        storeId: string
        unitsSold: number
        revenueAtRisk: number
      }
    >()

    for (const item of orderItemsWithMissingCOGS) {
      if (!item.product) continue
      const key = `${item.product.id}::${item.sku}`
      const existing = missingCOGSMap.get(key) || {
        productId: item.product.id,
        sku: item.sku,
        productName: item.productName,
        storeId: item.product.storeId,
        unitsSold: 0,
        revenueAtRisk: 0,
      }
      existing.unitsSold += item.quantity
      existing.revenueAtRisk += Number(item.total)
      missingCOGSMap.set(key, existing)
    }

    const missingCOGS = Array.from(missingCOGSMap.values())
      .map((m) => {
        const store = storeMap.get(m.storeId)
        return {
          ...m,
          storeName: store?.name ?? "Unknown",
          revenueAtRisk: Math.round(m.revenueAtRisk * 100) / 100,
        }
      })
      .sort((a, b) => b.revenueAtRisk - a.revenueAtRisk) // Highest revenue at risk first

    return NextResponse.json({
      negativeROI,
      lowROAS,
      missingCOGS,
      roasThreshold,
      summary: {
        negativeROIDays: negativeROI.length,
        lowROASDays: lowROAS.length,
        missingCOGSCount: missingCOGS.length,
      },
    })
  } catch (error: any) {
    console.error("Alerts report error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to generate alerts" },
      { status: 500 }
    )
  }
}
