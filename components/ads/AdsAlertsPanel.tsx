"use client"

import { useMemo } from "react"
import { AlertTriangle, TrendingDown, Zap, CheckCircle } from "lucide-react"

interface AdsRow {
  date?: string
  accountName?: string
  platform?: string
  spend: number
  purchases?: number
  purchaseValue?: number
  roas?: number
  accountBreakdown?: {
    accountName: string
    platform: string
    spend: number
    purchases?: number
    purchaseValue?: number
    roas?: number
  }[]
}

interface Alert {
  type: "high_spend_no_purchase" | "low_roas" | "zero_revenue" | "spend_spike"
  severity: "error" | "warning"
  account: string
  platform: string
  message: string
  spend: number
  roas?: number
}

interface Props {
  rows: AdsRow[]
  roasThreshold?: number      // default 1.5
  spendThreshold?: number     // default 50 — flag accounts with spend > $X and 0 purchases
  totalSpend?: number
}

export default function AdsAlertsPanel({
  rows,
  roasThreshold = 1.5,
  spendThreshold = 50,
  totalSpend,
}: Props) {
  const alerts = useMemo<Alert[]>(() => {
    const result: Alert[] = []

    // Aggregate by account across all rows (handles both groupBy=day and groupBy=account)
    const accMap = new Map<string, {
      accountName: string
      platform: string
      spend: number
      purchases?: number
      purchaseValue?: number
    }>()

    const merge = (
      accountName: string,
      platform: string,
      spend: number,
      purchases?: number,
      purchaseValue?: number
    ) => {
      const key = `${accountName}|${platform}`
      const ex = accMap.get(key)
      if (!ex) {
        accMap.set(key, { accountName, platform, spend, purchases, purchaseValue })
      } else {
        ex.spend += spend
        if (purchases !== undefined) ex.purchases = (ex.purchases ?? 0) + purchases
        if (purchaseValue !== undefined) ex.purchaseValue = (ex.purchaseValue ?? 0) + purchaseValue
      }
    }

    for (const row of rows) {
      if (row.accountBreakdown && row.accountBreakdown.length > 0) {
        for (const bd of row.accountBreakdown) {
          merge(bd.accountName, bd.platform, bd.spend, bd.purchases, bd.purchaseValue)
        }
      } else if (row.accountName) {
        merge(row.accountName, row.platform ?? "—", row.spend, row.purchases, row.purchaseValue)
      }
    }

    for (const acc of accMap.values()) {
      const roas =
        acc.purchaseValue && acc.purchaseValue > 0 && acc.spend > 0
          ? acc.purchaseValue / acc.spend
          : undefined

      // 1. High spend, zero purchases
      if (acc.spend >= spendThreshold && (!acc.purchases || acc.purchases === 0)) {
        result.push({
          type: "high_spend_no_purchase",
          severity: "error",
          account: acc.accountName,
          platform: acc.platform,
          spend: acc.spend,
          roas: undefined,
          message: `Spent $${acc.spend.toFixed(2)} but 0 purchases recorded`,
        })
        continue
      }

      // 2. Revenue = 0 but has purchases (data inconsistency)
      if (acc.purchases && acc.purchases > 0 && (!acc.purchaseValue || acc.purchaseValue === 0)) {
        result.push({
          type: "zero_revenue",
          severity: "warning",
          account: acc.accountName,
          platform: acc.platform,
          spend: acc.spend,
          message: `${acc.purchases} purchases recorded but revenue = $0 (missing data?)`,
        })
        continue
      }

      // 3. Low ROAS (below threshold)
      if (roas !== undefined && roas < roasThreshold && acc.spend >= spendThreshold) {
        result.push({
          type: "low_roas",
          severity: roas < 1 ? "error" : "warning",
          account: acc.accountName,
          platform: acc.platform,
          spend: acc.spend,
          roas,
          message: `ROAS ${roas.toFixed(2)}x is below threshold ${roasThreshold}x`,
        })
      }
    }

    // Sort: errors first, then by spend desc
    return result.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1
      return b.spend - a.spend
    })
  }, [rows, roasThreshold, spendThreshold])

  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-green-50 border border-green-100 px-5 py-4">
        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-green-800">All accounts look healthy</p>
          <p className="text-xs text-green-600 mt-0.5">
            No accounts with high spend / low ROAS detected for the selected period.
          </p>
        </div>
      </div>
    )
  }

  const errorCount = alerts.filter((a) => a.severity === "error").length
  const warnCount = alerts.filter((a) => a.severity === "warning").length

  const AlertIcon = ({ type }: { type: Alert["type"] }) => {
    if (type === "high_spend_no_purchase") return <Zap className="w-4 h-4" />
    if (type === "low_roas") return <TrendingDown className="w-4 h-4" />
    return <AlertTriangle className="w-4 h-4" />
  }

  const PlatformBadge = ({ platform }: { platform: string }) => {
    const p = platform.toLowerCase()
    if (p === "facebook") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">FB</span>
    if (p === "google") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-medium">GG</span>
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium capitalize">{platform}</span>
  }

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {errorCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 border border-red-100 text-xs font-semibold text-red-700">
            <AlertTriangle className="w-3.5 h-3.5" />
            {errorCount} critical
          </span>
        )}
        {warnCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-100 text-xs font-semibold text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5" />
            {warnCount} warning{warnCount > 1 ? "s" : ""}
          </span>
        )}
        <span className="text-xs text-gray-400">
          Threshold: ROAS &lt; {roasThreshold}x · Spend ≥ ${spendThreshold}
        </span>
      </div>

      {/* Alert list */}
      <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
        {alerts.map((alert, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-4 px-5 py-4 ${
              alert.severity === "error" ? "bg-red-50/60" : "bg-amber-50/50"
            }`}
          >
            <div
              className={`mt-0.5 flex-shrink-0 rounded-lg p-1.5 ${
                alert.severity === "error"
                  ? "bg-red-100 text-red-600"
                  : "bg-amber-100 text-amber-600"
              }`}
            >
              <AlertIcon type={alert.type} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-900 truncate max-w-[280px]">
                  {alert.account}
                </span>
                <PlatformBadge platform={alert.platform} />
              </div>
              <p className={`text-xs mt-0.5 ${alert.severity === "error" ? "text-red-700" : "text-amber-700"}`}>
                {alert.message}
              </p>
            </div>

            <div className="text-right flex-shrink-0 space-y-0.5">
              <p className="text-sm font-semibold text-gray-900">${alert.spend.toFixed(2)}</p>
              {alert.roas !== undefined && (
                <p className={`text-xs font-medium ${alert.roas < 1 ? "text-red-600" : "text-amber-600"}`}>
                  ROAS {alert.roas.toFixed(2)}x
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
