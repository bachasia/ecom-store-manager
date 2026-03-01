import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { getStoreIdsWithPermission } from "@/lib/permissions"
import { getUserTimezone, buildDateOnlyRangeFilter } from "@/lib/utils/timezone"

/**
 * GET /api/ads/report
 *
 * Query params:
 *   storeId   — filter theo store (optional, default: all accessible stores)
 *   from      — YYYY-MM-DD (required)
 *   to        — YYYY-MM-DD (required)
 *   groupBy   — "day" | "account" | "platform" (default: "day")
 *
 * Response:
 *   rows: AdsReportRow[]
 *   summary: { totalSpend, totalPurchases, totalPurchaseValue, avgRoas, avgCtr, avgCpm, avgCpc }
 *   accountNames: string[]  — danh sách unique account names trong kết quả
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get("storeId")
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const groupBy = (searchParams.get("groupBy") || "day") as "day" | "account" | "platform"

    if (!from || !to) {
      return NextResponse.json({ error: "from and to date params are required" }, { status: 400 })
    }

    // Lấy danh sách store IDs user có quyền view
    const accessibleStoreIds = await getStoreIdsWithPermission(session.user.id, "view_dashboard")

    const storeIds = storeId
      ? accessibleStoreIds.includes(storeId) ? [storeId] : []
      : accessibleStoreIds

    if (storeIds.length === 0) {
      return NextResponse.json({ rows: [], summary: emptySummary(), accountNames: [] })
    }

    // Query AdsCost — AdsCost.date is a Date-only column, no timezone shift needed
    const adsDateFilter = buildDateOnlyRangeFilter(from, to)
    const adsCosts = await prisma.adsCost.findMany({
      where: {
        storeId: { in: storeIds },
        ...(adsDateFilter ? { date: adsDateFilter } : {}),
      },
      orderBy: [{ date: "asc" }, { accountName: "asc" }],
      select: {
        id: true,
        storeId: true,
        date: true,
        platform: true,
        accountName: true,
        currency: true,
        spend: true,
        originalSpend: true,
        exchangeRate: true,
        ctr: true,
        cpm: true,
        purchases: true,
        costPerPurchase: true,
        purchaseValue: true,
        cpc: true,
        store: { select: { id: true, name: true, platform: true } },
      },
    })

    // Normalize thành rows
    const normalizedRows = adsCosts.map((r) => {
      const pv = r.purchaseValue !== null ? Number(r.purchaseValue) : undefined
      return {
        id: r.id,
        storeId: r.storeId,
        storeName: r.store.name,
        storePlatform: r.store.platform,
        date: r.date.toISOString().split("T")[0],
        platform: r.platform,
        accountName: r.accountName,
        currency: r.currency,
        spend: Number(r.spend),
        originalSpend: r.originalSpend !== null ? Number(r.originalSpend) : undefined,
        exchangeRate: r.exchangeRate !== null ? Number(r.exchangeRate) : undefined,
        ctr: r.ctr !== null ? Number(r.ctr) : undefined,
        cpm: r.cpm !== null ? Number(r.cpm) : undefined,
        purchases: r.purchases ?? undefined,
        costPerPurchase: r.costPerPurchase !== null ? Number(r.costPerPurchase) : undefined,
        // purchaseValue: chỉ set khi > 0 — tránh ngày không có conversion gây ROAS = 0
        purchaseValue: pv !== undefined && pv > 0 ? pv : undefined,
        cpc: r.cpc !== null ? Number(r.cpc) : undefined,
      }
    })

    // Group nếu cần
    let rows: AdsReportRow[]
    if (groupBy === "account") {
      rows = groupByAccount(normalizedRows)
    } else if (groupBy === "platform") {
      rows = groupByPlatform(normalizedRows)
    } else {
      // groupBy === "day" — giữ raw rows nhưng aggregate nếu có nhiều rows cùng ngày+account
      rows = groupByDay(normalizedRows)
    }

    // Summary tổng
    const summary = calcSummary(normalizedRows)

    // Danh sách account names unique
    const accountNames = [...new Set(normalizedRows.map((r) => r.accountName).filter(Boolean))].sort()

    return NextResponse.json({ rows, summary, accountNames })
  } catch (error) {
    console.error("GET /api/ads/report error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface NormalizedRow {
  id: string
  storeId: string
  storeName: string
  storePlatform: string
  date: string
  platform: string
  accountName: string
  currency: string
  spend: number
  originalSpend?: number
  exchangeRate?: number
  ctr?: number
  cpm?: number
  purchases?: number
  costPerPurchase?: number
  purchaseValue?: number
  cpc?: number
}

export interface AdsReportRow {
  groupKey: string         // date | accountName | platform (dùng cho grouping)
  date?: string
  accountName?: string
  platform?: string
  storeName?: string
  storeId?: string
  spend: number
  purchases?: number
  purchaseValue?: number
  costPerPurchase?: number // CPP
  roas?: number            // purchaseValue / spend — chỉ set khi purchaseValue > 0
  ctr?: number
  cpm?: number
  cpc?: number
  rowCount: number         // số raw rows gộp lại
  // By-day breakdown: danh sách account + metrics trong ngày (chỉ có khi groupBy = day)
  accountBreakdown?: {
    accountName: string
    storeName: string
    storePlatform: string
    platform: string
    spend: number
    purchases?: number
    purchaseValue?: number
    costPerPurchase?: number
    roas?: number
    ctr?: number
    cpm?: number
    cpc?: number
    rowCount: number
  }[]
}

// ─── Grouping helpers ──────────────────────────────────────────────────────────

function groupByDay(rows: NormalizedRow[]): AdsReportRow[] {
  const map = new Map<string, AdsReportRow>()

  type AccEntry = {
    storeName: string
    storePlatform: string
    platform: string
    spend: number
    purchases?: number
    purchaseValue?: number
    costPerPurchase?: number
    ctr?: number
    cpm?: number
    cpc?: number
    rowCount: number
  }
  const breakdownMap = new Map<string, Map<string, AccEntry>>()

  for (const r of rows) {
    const key = r.date
    const pv = r.purchaseValue && r.purchaseValue > 0 ? r.purchaseValue : undefined

    // Aggregate day row
    const existing = map.get(key)
    if (!existing) {
      map.set(key, {
        groupKey: key,
        date: r.date,
        spend: r.spend,
        purchases: r.purchases,
        purchaseValue: pv,
        costPerPurchase: r.costPerPurchase,
        roas: pv && r.spend ? pv / r.spend : undefined,
        ctr: r.ctr,
        cpm: r.cpm,
        cpc: r.cpc,
        rowCount: 1,
        accountBreakdown: [],
      })
    } else {
      mergeInto(existing, r)
    }

    // Build per-account breakdown với đầy đủ metrics
    if (!breakdownMap.has(key)) breakdownMap.set(key, new Map())
    const dayBreakdown = breakdownMap.get(key)!
    const accKey = `${r.accountName}|${r.storeId}`
    const accExisting = dayBreakdown.get(accKey)
    if (!accExisting) {
      dayBreakdown.set(accKey, {
        storeName: r.storeName,
        storePlatform: r.storePlatform,
        platform: r.platform,
        spend: r.spend,
        purchases: r.purchases,
        purchaseValue: pv,
        costPerPurchase: r.costPerPurchase,
        ctr: r.ctr,
        cpm: r.cpm,
        cpc: r.cpc,
        rowCount: 1,
      })
    } else {
      accExisting.spend += r.spend
      if (r.purchases !== undefined) accExisting.purchases = (accExisting.purchases || 0) + r.purchases
      if (pv !== undefined) accExisting.purchaseValue = (accExisting.purchaseValue || 0) + pv
      // CPP: weighted average by purchases
      if (r.costPerPurchase !== undefined && r.purchases && r.purchases > 0) {
        const prevPurchases = (accExisting.purchases || 0) - r.purchases
        accExisting.costPerPurchase = ((accExisting.costPerPurchase || 0) * prevPurchases + r.costPerPurchase * r.purchases) / (accExisting.purchases || 1)
      }
      // CTR, CPM, CPC: running average
      if (r.ctr !== undefined) accExisting.ctr = ((accExisting.ctr || 0) * accExisting.rowCount + r.ctr) / (accExisting.rowCount + 1)
      if (r.cpm !== undefined) accExisting.cpm = ((accExisting.cpm || 0) * accExisting.rowCount + r.cpm) / (accExisting.rowCount + 1)
      if (r.cpc !== undefined) accExisting.cpc = ((accExisting.cpc || 0) * accExisting.rowCount + r.cpc) / (accExisting.rowCount + 1)
      accExisting.rowCount++
    }
  }

  // Attach breakdown to each day row
  const result = Array.from(map.values()).sort((a, b) =>
    (a.date || "").localeCompare(b.date || "")
  )
  for (const row of result) {
    const dayBreakdown = breakdownMap.get(row.date!)
    if (dayBreakdown) {
      row.accountBreakdown = Array.from(dayBreakdown.entries()).map(([accKey, val]) => {
        const roas = val.purchaseValue && val.purchaseValue > 0 && val.spend
          ? val.purchaseValue / val.spend
          : undefined
        return {
          accountName: accKey.split("|")[0],
          storeName: val.storeName,
          storePlatform: val.storePlatform,
          platform: val.platform,
          spend: val.spend,
          purchases: val.purchases,
          purchaseValue: val.purchaseValue,
          costPerPurchase: val.costPerPurchase,
          roas,
          ctr: val.ctr,
          cpm: val.cpm,
          cpc: val.cpc,
          rowCount: val.rowCount,
        }
      }).sort((a, b) => b.spend - a.spend)
    }
  }
  return result
}

function groupByAccount(rows: NormalizedRow[]): AdsReportRow[] {
  const map = new Map<string, AdsReportRow>()

  for (const r of rows) {
    const key = `${r.accountName}|${r.storeId}`
    const existing = map.get(key)
    if (!existing) {
      const pv = r.purchaseValue && r.purchaseValue > 0 ? r.purchaseValue : undefined
      map.set(key, {
        groupKey: key,
        accountName: r.accountName,
        platform: r.platform,
        storeName: r.storeName,
        storeId: r.storeId,
        spend: r.spend,
        purchases: r.purchases,
        purchaseValue: pv,
        costPerPurchase: r.costPerPurchase,
        roas: undefined,
        ctr: r.ctr,
        cpm: r.cpm,
        cpc: r.cpc,
        rowCount: 1,
      })
    } else {
      mergeInto(existing, r)
    }
  }

  const result = Array.from(map.values())
  result.forEach((row) => {
    row.roas = row.purchaseValue && row.purchaseValue > 0 && row.spend ? row.purchaseValue / row.spend : undefined
  })
  return result.sort((a, b) => (b.spend || 0) - (a.spend || 0))
}

function groupByPlatform(rows: NormalizedRow[]): AdsReportRow[] {
  const map = new Map<string, AdsReportRow>()

  for (const r of rows) {
    const key = r.platform
    const existing = map.get(key)
    if (!existing) {
      const pv = r.purchaseValue && r.purchaseValue > 0 ? r.purchaseValue : undefined
      map.set(key, {
        groupKey: key,
        platform: r.platform,
        spend: r.spend,
        purchases: r.purchases,
        purchaseValue: pv,
        costPerPurchase: r.costPerPurchase,
        roas: undefined,
        ctr: r.ctr,
        cpm: r.cpm,
        cpc: r.cpc,
        rowCount: 1,
      })
    } else {
      mergeInto(existing, r)
    }
  }

  const result = Array.from(map.values())
  result.forEach((row) => {
    row.roas = row.purchaseValue && row.purchaseValue > 0 && row.spend ? row.purchaseValue / row.spend : undefined
  })
  return result.sort((a, b) => (b.spend || 0) - (a.spend || 0))
}

/** Merge một raw row vào aggregated row */
function mergeInto(target: AdsReportRow, r: NormalizedRow) {
  target.spend += r.spend
  if (r.purchases !== undefined) target.purchases = (target.purchases || 0) + r.purchases
  // Chỉ cộng purchaseValue khi > 0 (tránh ngày không có conversion làm roas = 0)
  if (r.purchaseValue !== undefined && r.purchaseValue > 0) {
    target.purchaseValue = (target.purchaseValue || 0) + r.purchaseValue
  }
  // CPP: weighted average (nếu có purchases)
  if (r.costPerPurchase !== undefined && r.purchases && r.purchases > 0) {
    const prevPurchases = (target.purchases || 0) - r.purchases
    const prevTotal = (target.costPerPurchase || 0) * prevPurchases
    const newTotal = prevTotal + r.costPerPurchase * r.purchases
    const totalPurchases = (target.purchases || 0)
    target.costPerPurchase = totalPurchases > 0 ? newTotal / totalPurchases : undefined
  }
  // CTR, CPM, CPC: running average
  if (r.ctr !== undefined) target.ctr = ((target.ctr || 0) * target.rowCount + r.ctr) / (target.rowCount + 1)
  if (r.cpm !== undefined) target.cpm = ((target.cpm || 0) * target.rowCount + r.cpm) / (target.rowCount + 1)
  if (r.cpc !== undefined) target.cpc = ((target.cpc || 0) * target.rowCount + r.cpc) / (target.rowCount + 1)
  target.rowCount++
  // Recalc ROAS sau merge
  target.roas = target.purchaseValue && target.purchaseValue > 0 && target.spend
    ? target.purchaseValue / target.spend
    : undefined
}

function calcSummary(rows: NormalizedRow[]) {
  let totalSpend = 0
  let totalPurchases = 0
  let totalPurchaseValue = 0
  let ctrSum = 0; let ctrCount = 0
  let cpmSum = 0; let cpmCount = 0
  let cpcSum = 0; let cpcCount = 0

  for (const r of rows) {
    totalSpend += r.spend
    if (r.purchases !== undefined) totalPurchases += r.purchases
    if (r.purchaseValue !== undefined) totalPurchaseValue += r.purchaseValue
    if (r.ctr !== undefined) { ctrSum += r.ctr; ctrCount++ }
    if (r.cpm !== undefined) { cpmSum += r.cpm; cpmCount++ }
    if (r.cpc !== undefined) { cpcSum += r.cpc; cpcCount++ }
  }

  return {
    totalSpend,
    totalPurchases,
    totalPurchaseValue,
    roas: totalSpend > 0 ? totalPurchaseValue / totalSpend : 0,
    avgCtr: ctrCount > 0 ? ctrSum / ctrCount : undefined,
    avgCpm: cpmCount > 0 ? cpmSum / cpmCount : undefined,
    avgCpc: cpcCount > 0 ? cpcSum / cpcCount : undefined,
  }
}

function emptySummary() {
  return { totalSpend: 0, totalPurchases: 0, totalPurchaseValue: 0, roas: 0 }
}
