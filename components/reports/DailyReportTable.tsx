"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react"

// ── Types ────────────────────────────────────────────────────────────────────

export interface StoreDrilldown {
  storeId: string
  storeName: string
  orders: number
  revenue: number
  cogs: number
  adsCost: number
  transactionFees: number
  grossProfit: number
  netProfit: number
  profitMargin: number
  roas: number | null
}

export interface DailyRow {
  date: string
  orders: number
  revenue: number
  cogs: number
  adsCost: number
  transactionFees: number
  grossProfit: number
  netProfit: number
  profitMargin: number
  roas: number | null
  stores?: StoreDrilldown[]
}

interface DailyReportTableProps {
  data: DailyRow[]
  loading?: boolean
  /** Pass true when /api/reports/daily was called with drilldown=true */
  hasDrilldown?: boolean
  /** Called when a row is expanded and drilldown data isn't pre-loaded */
  onExpandRow?: (date: string) => Promise<StoreDrilldown[]>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const fmtDec = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

function marginColor(margin: number): string {
  if (margin < 0) return "bg-red-50 text-red-700"
  if (margin < 10) return "bg-yellow-50 text-yellow-700"
  return "bg-green-50 text-green-700"
}

function rowBg(margin: number): string {
  if (margin < 0) return "bg-red-50/40"
  if (margin < 10) return "bg-yellow-50/30"
  return ""
}

function MarginBadge({ value }: { value: number }) {
  const cls = marginColor(value)
  const Icon = value < 0 ? TrendingDown : value < 10 ? Minus : TrendingUp
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      <Icon className="h-3 w-3" />
      {value.toFixed(1)}%
    </span>
  )
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
      ))}
    </div>
  )
}

// ── Sub-row: store drilldown ──────────────────────────────────────────────────

function StoreSubRow({ store }: { store: StoreDrilldown }) {
  return (
    <tr className="border-t border-gray-100 bg-indigo-50/30">
      <td className="py-2 pl-12 pr-3 text-sm text-indigo-700 font-medium whitespace-nowrap">
        ↳ {store.storeName}
      </td>
      <td className="px-3 py-2 text-right text-sm text-gray-600">{store.orders}</td>
      <td className="px-3 py-2 text-right text-sm text-gray-700">{fmt.format(store.revenue)}</td>
      <td className="px-3 py-2 text-right text-sm text-gray-500">{fmt.format(store.cogs)}</td>
      <td className="px-3 py-2 text-right text-sm text-gray-500">{fmt.format(store.adsCost)}</td>
      <td className="px-3 py-2 text-right text-sm text-gray-500">{fmt.format(store.transactionFees)}</td>
      <td className="px-3 py-2 text-right text-sm text-gray-700">{fmt.format(store.grossProfit)}</td>
      <td className="px-3 py-2 text-right text-sm font-medium">
        <span className={store.netProfit < 0 ? "text-red-600" : "text-gray-900"}>
          {fmtDec.format(store.netProfit)}
        </span>
      </td>
      <td className="px-3 py-2 text-center">
        <MarginBadge value={store.profitMargin} />
      </td>
      <td className="px-3 py-2 text-right text-sm text-gray-500">
        {store.roas !== null ? store.roas.toFixed(2) : "—"}
      </td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DailyReportTable({
  data,
  loading = false,
  hasDrilldown = false,
  onExpandRow,
}: DailyReportTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [drilldownCache, setDrilldownCache] = useState<Record<string, StoreDrilldown[]>>({})
  const [loadingDrilldown, setLoadingDrilldown] = useState<Set<string>>(new Set())

  async function toggleRow(date: string, preloadedStores?: StoreDrilldown[]) {
    const next = new Set(expanded)

    if (next.has(date)) {
      next.delete(date)
      setExpanded(next)
      return
    }

    // If we already have stores data in the row, use it
    if (preloadedStores && preloadedStores.length > 0) {
      setDrilldownCache((prev) => ({ ...prev, [date]: preloadedStores }))
    } else if (!drilldownCache[date] && onExpandRow) {
      // Lazy-fetch drilldown data
      setLoadingDrilldown((prev) => new Set(prev).add(date))
      try {
        const stores = await onExpandRow(date)
        setDrilldownCache((prev) => ({ ...prev, [date]: stores }))
      } finally {
        setLoadingDrilldown((prev) => {
          const s = new Set(prev)
          s.delete(date)
          return s
        })
      }
    }

    next.add(date)
    setExpanded(next)
  }

  if (loading) return <Skeleton />

  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-gray-100 bg-white text-sm text-gray-500">
        No data for selected period
      </div>
    )
  }

  const canExpand = hasDrilldown || !!onExpandRow

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/80">
            <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">Date</th>
            <th className="px-3 py-3 text-right font-semibold text-gray-700">Orders</th>
            <th className="px-3 py-3 text-right font-semibold text-gray-700">Revenue</th>
            <th className="px-3 py-3 text-right font-semibold text-gray-700">COGS</th>
            <th className="px-3 py-3 text-right font-semibold text-gray-700">Ads Cost</th>
            <th className="px-3 py-3 text-right font-semibold text-gray-700">Tx Fees</th>
            <th className="px-3 py-3 text-right font-semibold text-gray-700">Gross Profit</th>
            <th className="px-3 py-3 text-right font-semibold text-gray-700">Net Profit</th>
            <th className="px-3 py-3 text-center font-semibold text-gray-700">Margin</th>
            <th className="px-3 py-3 text-right font-semibold text-gray-700">ROAS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((row) => {
            const isExpanded = expanded.has(row.date)
            const isLoadingRow = loadingDrilldown.has(row.date)
            const storeRows = drilldownCache[row.date] ?? row.stores ?? []

            return (
              <>
                <tr
                  key={row.date}
                  className={`transition-colors hover:bg-gray-50 ${rowBg(row.profitMargin)} ${canExpand ? "cursor-pointer" : ""}`}
                  onClick={() => canExpand && toggleRow(row.date, row.stores)}
                >
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                    <span className="flex items-center gap-2">
                      {canExpand && (
                        isExpanded
                          ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                          : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                      )}
                      {formatDate(row.date)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-gray-700">{row.orders}</td>
                  <td className="px-3 py-3 text-right font-medium text-gray-900">{fmt.format(row.revenue)}</td>
                  <td className="px-3 py-3 text-right text-gray-500">{fmt.format(row.cogs)}</td>
                  <td className="px-3 py-3 text-right text-gray-500">{fmt.format(row.adsCost)}</td>
                  <td className="px-3 py-3 text-right text-gray-500">{fmt.format(row.transactionFees)}</td>
                  <td className="px-3 py-3 text-right text-gray-700">{fmt.format(row.grossProfit)}</td>
                  <td className="px-3 py-3 text-right font-semibold">
                    <span className={row.netProfit < 0 ? "text-red-600" : "text-gray-900"}>
                      {fmtDec.format(row.netProfit)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <MarginBadge value={row.profitMargin} />
                  </td>
                  <td className="px-3 py-3 text-right text-gray-600">
                    {row.roas !== null ? row.roas.toFixed(2) : "—"}
                  </td>
                </tr>

                {/* Drilldown loader */}
                {isLoadingRow && (
                  <tr key={`${row.date}-loading`}>
                    <td colSpan={10} className="py-2 pl-12 text-sm text-gray-400 italic">
                      Loading store breakdown…
                    </td>
                  </tr>
                )}

                {/* Per-store drilldown rows */}
                {isExpanded && !isLoadingRow && storeRows.map((store) => (
                  <StoreSubRow key={`${row.date}-${store.storeId}`} store={store} />
                ))}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
