"use client"

import { useState, useMemo } from "react"
import { ArrowUp, ArrowDown, ArrowUpDown, TrendingDown, Star } from "lucide-react"
import PlatformIcon from "@/components/ui/platform-icon"

// ── Types ────────────────────────────────────────────────────────────────────

export interface SKURow {
  sku: string
  productName: string
  storeId: string
  storeName: string
  platform: string
  unitsSold: number
  ordersCount: number
  revenue: number
  cogs: number
  adsCost: number
  transactionFees: number
  grossProfit: number
  grossMargin: number
  netProfit: number
  profitMargin: number
  roas: number | null
}

interface SKUReportTableProps {
  data: {
    all: SKURow[]
    profitable: SKURow[]
    lossmaking: SKURow[]
    total: number
    profitableCount: number
    lossmakingCount: number
  }
  loading?: boolean
}

type TabKey = "all" | "profitable" | "lossmaking"
type SortField = "netProfit" | "revenue" | "profitMargin" | "unitsSold" | "cogs" | "adsCost"
type SortDir = "asc" | "desc"

// ── Helpers ───────────────────────────────────────────────────────────────────

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
})

function rowClass(row: SKURow, rank: number, tab: TabKey): string {
  if (tab === "lossmaking") return "bg-red-50/40"
  if (tab === "profitable" && rank <= 10) return "bg-green-50/30"
  if (row.netProfit < 0) return "bg-red-50/40"
  return ""
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-gray-300 inline" />
  return sortDir === "desc"
    ? <ArrowDown className="ml-1 h-3.5 w-3.5 text-indigo-500 inline" />
    : <ArrowUp className="ml-1 h-3.5 w-3.5 text-indigo-500 inline" />
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
      ))}
    </div>
  )
}

// ── Tab button ────────────────────────────────────────────────────────────────

function Tab({
  active,
  onClick,
  label,
  count,
  color,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  color: "indigo" | "green" | "red"
}) {
  const colorMap = {
    indigo: {
      active: "bg-indigo-600 text-white",
      badge: "bg-indigo-100 text-indigo-700",
    },
    green: {
      active: "bg-green-600 text-white",
      badge: "bg-green-100 text-green-700",
    },
    red: {
      active: "bg-red-600 text-white",
      badge: "bg-red-100 text-red-700",
    },
  }

  const c = colorMap[color]
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
        active ? c.active : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          active ? "bg-white/20 text-white" : c.badge
        }`}
      >
        {count}
      </span>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SKUReportTable({ data, loading = false }: SKUReportTableProps) {
  const [tab, setTab] = useState<TabKey>("all")
  const [sortField, setSortField] = useState<SortField>("netProfit")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"))
    } else {
      setSortField(field)
      setSortDir("desc")
    }
  }

  const rows = useMemo(() => {
    const source = data[tab] ?? []
    return [...source].sort((a, b) => {
      const av = a[sortField]
      const bv = b[sortField]
      // null luôn đẩy xuống cuối bất kể chiều sort
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return sortDir === "desc" ? (bv as number) - (av as number) : (av as number) - (bv as number)
    })
  }, [data, tab, sortField, sortDir])

  if (loading) return <Skeleton />

  const isEmpty = !data.all || data.all.length === 0

  if (isEmpty) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-gray-100 bg-white text-sm text-gray-500">
        No SKU data for selected period
      </div>
    )
  }

  function ThBtn({ field, label }: { field: SortField; label: string }) {
    return (
      <th
        className="px-3 py-3 text-right font-semibold text-gray-700 cursor-pointer select-none whitespace-nowrap hover:text-indigo-600 transition-colors"
        onClick={() => handleSort(field)}
      >
        {label}
        <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
      </th>
    )
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <Tab active={tab === "all"} onClick={() => setTab("all")} label="All SKUs" count={data.total} color="indigo" />
        <Tab active={tab === "profitable"} onClick={() => setTab("profitable")} label="Profitable" count={data.profitableCount} color="green" />
        <Tab active={tab === "lossmaking"} onClick={() => setTab("lossmaking")} label="Loss-making" count={data.lossmakingCount} color="red" />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80">
              <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">#</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-700">SKU / Product</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">Store</th>
              <ThBtn field="unitsSold" label="Units Sold" />
              <ThBtn field="revenue" label="Revenue" />
              <ThBtn field="cogs" label="COGS" />
              <ThBtn field="adsCost" label="Ads Cost" />
              <ThBtn field="netProfit" label="Net Profit" />
              <ThBtn field="profitMargin" label="Margin %" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, idx) => {
              const rank = idx + 1
              return (
                <tr
                  key={`${row.storeId}-${row.sku}`}
                  className={`transition-colors hover:bg-gray-50/80 ${rowClass(row, rank, tab)}`}
                >
                  {/* Rank */}
                  <td className="px-4 py-3 text-xs text-gray-400 font-medium">
                    <span className="flex items-center gap-1">
                      {tab === "profitable" && rank <= 10 ? (
                        <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                      ) : tab === "lossmaking" ? (
                        <TrendingDown className="h-3 w-3 text-red-400" />
                      ) : null}
                      {rank}
                    </span>
                  </td>

                  {/* SKU / Name */}
                  <td className="px-3 py-3 max-w-xs">
                    <p className="font-medium text-gray-900 truncate" title={row.productName}>
                      {row.productName}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">{row.sku}</p>
                  </td>

                  {/* Store */}
                  <td className="px-3 py-3 whitespace-nowrap text-gray-600 text-xs">
                    <span className="flex items-center gap-1.5">
                      <PlatformIcon platform={row.platform} size={14} />
                      {row.storeName}
                    </span>
                  </td>

                  {/* Units Sold */}
                  <td className="px-3 py-3 text-right text-gray-700">
                    {row.unitsSold.toLocaleString()}
                  </td>

                  {/* Revenue */}
                  <td className="px-3 py-3 text-right font-medium text-gray-900">
                    {fmt.format(row.revenue)}
                  </td>

                  {/* COGS */}
                  <td className="px-3 py-3 text-right text-gray-500">
                    {fmt.format(row.cogs)}
                  </td>

                  {/* Ads Cost */}
                  <td className="px-3 py-3 text-right text-gray-500">
                    {fmt.format(row.adsCost)}
                  </td>

                  {/* Net Profit */}
                  <td className="px-3 py-3 text-right font-semibold">
                    <span className={row.netProfit < 0 ? "text-red-600" : "text-gray-900"}>
                      {fmtDec.format(row.netProfit)}
                    </span>
                  </td>

                  {/* Margin */}
                  <td className="px-3 py-3 text-right">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.profitMargin < 0
                          ? "bg-red-100 text-red-700"
                          : row.profitMargin < 10
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {row.profitMargin.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="flex h-24 items-center justify-center text-sm text-gray-400">
            No {tab === "profitable" ? "profitable" : "loss-making"} SKUs in this period
          </div>
        )}
      </div>

      {/* Pagination notice: hiển thị khi API slice data */}
      {(() => {
        const total = tab === "all" ? data.total : tab === "profitable" ? data.profitableCount : data.lossmakingCount
        if (rows.length > 0 && rows.length < total) {
          return (
            <p className="text-xs text-gray-400 text-right">
              Showing {rows.length} of {total} SKUs
            </p>
          )
        }
        return null
      })()}
    </div>
  )
}
