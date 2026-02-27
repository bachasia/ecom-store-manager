"use client"

import { useState, useMemo } from "react"
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"
import PlatformIcon from "@/components/ui/platform-icon"

// ── Types ────────────────────────────────────────────────────────────────────

export interface StoreComparisonRow {
  storeId: string
  storeName: string
  platform: string
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

interface StoreComparisonTableProps {
  data: StoreComparisonRow[]
  loading?: boolean
}

type SortField =
  | "revenue"
  | "orders"
  | "cogs"
  | "adsCost"
  | "transactionFees"
  | "grossProfit"
  | "netProfit"
  | "profitMargin"
  | "roas"
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


function Skeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
      ))}
    </div>
  )
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-gray-300 inline" />
  return sortDir === "desc"
    ? <ArrowDown className="ml-1 h-3.5 w-3.5 text-indigo-500 inline" />
    : <ArrowUp className="ml-1 h-3.5 w-3.5 text-indigo-500 inline" />
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StoreComparisonTable({ data, loading = false }: StoreComparisonTableProps) {
  const [sortField, setSortField] = useState<SortField>("revenue")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"))
    } else {
      setSortField(field)
      setSortDir("desc")
    }
  }

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const av = a[sortField]
      const bv = b[sortField]
      // null luôn đẩy xuống cuối bất kể chiều sort (tránh nhầm null ROAS = ROAS 0)
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return sortDir === "desc" ? (bv as number) - (av as number) : (av as number) - (bv as number)
    })
  }, [data, sortField, sortDir])

  if (loading) return <Skeleton />

  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-gray-100 bg-white text-sm text-gray-500">
        No store data for selected period
      </div>
    )
  }

  function ThBtn({ field, label, right = true }: { field: SortField; label: string; right?: boolean }) {
    return (
      <th
        className={`px-3 py-3 font-semibold text-gray-700 cursor-pointer select-none whitespace-nowrap hover:text-indigo-600 transition-colors ${right ? "text-right" : "text-left"}`}
        onClick={() => handleSort(field)}
      >
        {label}
        <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
      </th>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/80">
            <th className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">Store</th>
            <ThBtn field="orders" label="Orders" />
            <ThBtn field="revenue" label="Revenue" />
            <ThBtn field="cogs" label="COGS" />
            <ThBtn field="adsCost" label="Ads Cost" />
            <ThBtn field="transactionFees" label="Tx Fees" />
            <ThBtn field="grossProfit" label="Gross Profit" />
            <ThBtn field="netProfit" label="Net Profit" />
            <ThBtn field="profitMargin" label="Margin %" />
            <ThBtn field="roas" label="ROAS" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((row) => (
            <tr key={row.storeId} className="transition-colors hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                <span className="flex items-center gap-2">
                  <PlatformIcon platform={row.platform} size={16} />
                  {row.storeName}
                </span>
              </td>
              <td className="px-3 py-3 text-right text-gray-700">{row.orders.toLocaleString()}</td>
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
              <td className="px-3 py-3 text-right text-gray-600">
                {row.roas !== null ? row.roas.toFixed(2) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
