import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { getStoreIdsWithPermission, requireStorePermission } from "@/lib/permissions"
import { getUserTimezone, buildDateRangeFilter } from "@/lib/utils/timezone"

// GET /api/reports/sku
// Params: storeId?, startDate, endDate, sortBy=profit|revenue|margin|units, limit=50
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
    const sortBy = searchParams.get("sortBy") || "profit" // profit | revenue | margin | units
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500)

    // --- Resolve accessible store IDs ---
    let storeIds: string[] = []
    const storeMap = new Map<string, { name: string; platform: string }>()

    if (storeId) {
      const denied = await requireStorePermission(session.user.id, storeId, 'view_dashboard')
      if (denied) return denied
      const store = await prisma.store.findUnique({
        where: { id: storeId },
        select: { id: true, name: true, platform: true },
      })
      if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 })
      storeIds = [store.id]
      storeMap.set(store.id, { name: store.name, platform: store.platform })
    } else {
      const accessibleStoreIds = await getStoreIdsWithPermission(session.user.id, 'view_dashboard')
      const userStores = await prisma.store.findMany({
        where: { id: { in: accessibleStoreIds } },
        select: { id: true, name: true, platform: true },
      })
      storeIds = userStores.map((s) => s.id)
      userStores.forEach((s) =>
        storeMap.set(s.id, { name: s.name, platform: s.platform })
      )
    }

    if (storeIds.length === 0) {
      return NextResponse.json({
        all: [],
        profitable: [],
        lossmaking: [],
        total: 0,
      })
    }

    // --- Build order filter ---
    const timezone = await getUserTimezone(session.user.id)
    const orderWhere: any = {
      storeId: { in: storeIds },
      status: { in: ["completed", "processing", "paid", "authorized", "refunded"] },
    }
    const dateFilter = buildDateRangeFilter(startDate, endDate, timezone)
    if (dateFilter) orderWhere.orderDate = dateFilter

    // --- Fetch order items with order P&L + product info ---
    const orderItems = await prisma.orderItem.findMany({
      where: { order: orderWhere },
      select: {
        sku: true,
        productName: true,
        quantity: true,
        total: true,
        totalCost: true,
        product: {
          select: {
            id: true,
            storeId: true,
          },
        },
        order: {
          select: {
            id: true,
            storeId: true,
            total: true,
            refundAmount: true,
            transactionFee: true,
            allocatedAdsCost: true,
          },
        },
      },
    })

    // --- Aggregate by (storeId, sku) ---
    type SkuStoreKey = string // "storeId::sku"

    interface SkuAgg {
      sku: string
      productName: string
      storeId: string
      unitsSold: number
      revenue: number
      cogs: number
      transactionFees: number
      adsCost: number
      orderIds: Set<string>
    }

    const skuMap = new Map<SkuStoreKey, SkuAgg>()

    for (const item of orderItems) {
      const effectiveStoreId = item.product?.storeId ?? item.order.storeId
      const key = `${effectiveStoreId}::${item.sku}`

      const agg = skuMap.get(key) || {
        sku: item.sku,
        productName: item.productName,
        storeId: effectiveStoreId,
        unitsSold: 0,
        revenue: 0,
        cogs: 0,
        transactionFees: 0,
        adsCost: 0,
        orderIds: new Set<string>(),
      }

      const itemRevenue = Number(item.total)
      const orderTotal = Number(item.order.total)
      const orderRevenue = orderTotal - Number(item.order.refundAmount)
      // Tính proportion dựa trên tỷ lệ item/orderTotal (pre-refund), rồi scale theo refund
      // Tránh proportion > 1 khi refund làm orderRevenue < itemRevenue
      const proportion = orderTotal > 0
        ? Math.min(itemRevenue / orderTotal, 1) * (orderRevenue > 0 ? orderRevenue / orderTotal : 0)
        : 0

      agg.unitsSold += item.quantity
      agg.revenue += itemRevenue
      agg.cogs += Number(item.totalCost)
      agg.transactionFees += Number(item.order.transactionFee) * proportion
      agg.adsCost += Number(item.order.allocatedAdsCost) * proportion
      agg.orderIds.add(item.order.id)

      skuMap.set(key, agg)
    }

    // --- Build result rows ---
    type SortKey = "profit" | "revenue" | "margin" | "units"

    const sortFn: Record<SortKey, (a: any, b: any) => number> = {
      profit: (a, b) => b.netProfit - a.netProfit,
      revenue: (a, b) => b.revenue - a.revenue,
      margin: (a, b) => b.profitMargin - a.profitMargin,
      units: (a, b) => b.unitsSold - a.unitsSold,
    }

    const all = Array.from(skuMap.values()).map((agg) => {
      const grossProfit = agg.revenue - agg.cogs
      const netProfit = grossProfit - agg.transactionFees - agg.adsCost
      const profitMargin =
        agg.revenue > 0 ? (netProfit / agg.revenue) * 100 : 0
      const grossMargin =
        agg.revenue > 0 ? (grossProfit / agg.revenue) * 100 : 0
      const roas = agg.adsCost > 0 ? agg.revenue / agg.adsCost : null
      const store = storeMap.get(agg.storeId)

      return {
        sku: agg.sku,
        productName: agg.productName,
        storeId: agg.storeId,
        storeName: store?.name ?? "Unknown",
        platform: store?.platform ?? "",
        unitsSold: agg.unitsSold,
        ordersCount: agg.orderIds.size,
        revenue: Math.round(agg.revenue * 100) / 100,
        cogs: Math.round(agg.cogs * 100) / 100,
        adsCost: Math.round(agg.adsCost * 100) / 100,
        transactionFees: Math.round(agg.transactionFees * 100) / 100,
        grossProfit: Math.round(grossProfit * 100) / 100,
        grossMargin: Math.round(grossMargin * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        profitMargin: Math.round(profitMargin * 100) / 100,
        roas: roas !== null ? Math.round(roas * 100) / 100 : null,
      }
    })

    const validSortBy: SortKey = (["profit", "revenue", "margin", "units"] as SortKey[]).includes(
      sortBy as SortKey
    )
      ? (sortBy as SortKey)
      : "profit"

    all.sort(sortFn[validSortBy])

    const profitable = all.filter((r) => r.netProfit > 0)
    const lossmaking = all
      .filter((r) => r.netProfit <= 0)
      .sort((a, b) => a.netProfit - b.netProfit) // Worst loss first

    return NextResponse.json({
      all: all.slice(0, limit),
      profitable: profitable.slice(0, limit),
      lossmaking: lossmaking.slice(0, limit),
      total: all.length,
      profitableCount: profitable.length,
      lossmakingCount: lossmaking.length,
    })
  } catch (error: any) {
    console.error("SKU report error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to generate SKU report" },
      { status: 500 }
    )
  }
}
