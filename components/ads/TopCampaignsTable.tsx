"use client"

import { useState, useMemo } from "react"
import { ArrowUpDown, ArrowUp, ArrowDown, TrendingUp, TrendingDown } from "lucide-react"

interface CampaignRow {
  campaignName: string
  accountName: string
  storeName: string
  platform: string
  spend: number
  purchases?: number
  purchaseValue?: number
  roas?: number
  costPerPurchase?: number
  ctr?: number
  cpc?: number
}

type SortKey = "spend" | "roas" | "purchases" | "purchaseValue" | "costPerPurchase" | "ctr"
type SortDir = "asc" | "desc"
type ViewMode = "top" | "bottom" | "all"

interface Props {
  rows: {
    groupKey: string
    accountName?: string
    storeName?: string
    platform?: string
    spend: number
    purchases?: number
    purchaseValue?: number
    roas?: number
    costPerPurchase?: number
    ctr?: number
    cpc?: number
  }[]
}

export default function TopCampaignsTable({ rows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("spend")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [viewMode, setViewMode] = useState<ViewMode>("top")
  const [filterPlatform, setFilterPlatform] = useState("all")
  const [limitN] = useState(10)

  // groupBy=account rows — map trực tiếp, không cần flatten
  const campaignRows = useMemo<CampaignRow[]>(() => {
    return rows.map((row) => ({
      campaignName: row.accountName || row.groupKey || "—",
      accountName: row.accountName || "—",
      storeName: row.storeName || "—",
      platform: row.platform || "—",
      spend: row.spend,
      purchases: row.purchases,
      purchaseValue: row.purchaseValue,
      roas: row.roas ?? (row.purchaseValue && row.spend ? row.purchaseValue / row.spend : undefined),
      costPerPurchase: row.costPerPurchase,
      ctr: row.ctr,
      cpc: row.cpc,
    }))
  }, [rows])

  const platforms = useMemo(() => {
    const s = new Set(campaignRows.map((r) => r.platform).filter(Boolean))
    return Array.from(s).sort()
  }, [campaignRows])

  const sorted = useMemo(() => {
    const filtered = filterPlatform === "all"
      ? campaignRows
      : campaignRows.filter((r) => r.platform === filterPlatform)

    const getValue = (r: CampaignRow, key: SortKey): number => {
      switch (key) {
        case "spend": return r.spend ?? 0
        case "roas": return r.roas ?? -1
        case "purchases": return r.purchases ?? 0
        case "purchaseValue": return r.purchaseValue ?? 0
        case "costPerPurchase": return r.costPerPurchase ?? Infinity
        case "ctr": return r.ctr ?? 0
      }
    }

    const s = [...filtered].sort((a, b) => {
      const av = getValue(a, sortKey)
      const bv = getValue(b, sortKey)
      return sortDir === "desc" ? bv - av : av - bv
    })

    if (viewMode === "top") return s.slice(0, limitN)
    if (viewMode === "bottom") return s.slice(-limitN).reverse()
    return s
  }, [campaignRows, filterPlatform, sortKey, sortDir, viewMode, limitN])

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"))
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 ml-1 text-gray-400 inline" />
    return sortDir === "desc"
      ? <ArrowDown className="w-3 h-3 ml-1 text-indigo-500 inline" />
      : <ArrowUp className="w-3 h-3 ml-1 text-indigo-500 inline" />
  }

  const roasColor = (v?: number) => {
    if (v === undefined) return "text-gray-300"
    if (v >= 3) return "text-green-600 font-semibold"
    if (v >= 2) return "text-amber-600 font-semibold"
    return "text-red-500 font-semibold"
  }

  const PlatformBadge = ({ platform }: { platform: string }) => {
    const p = platform.toLowerCase()
    if (p === "facebook") return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs">
        <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />
        FB
      </span>
    )
    if (p === "google") return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-yellow-50 text-yellow-700 text-xs">
        <span className="w-2 h-2 rounded-full bg-yellow-500 flex-shrink-0" />
        GG
      </span>
    )
    return (
      <span className="inline-flex px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600 text-xs capitalize">
        {platform}
      </span>
    )
  }

  if (campaignRows.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-gray-400">
        No account data. Switch to <strong>By account</strong> or <strong>By day</strong> view to see breakdowns.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {([["top", "Top 10"], ["bottom", "Bottom 10"], ["all", "All"]] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                viewMode === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {v === "top" && <TrendingUp className="w-3 h-3" />}
              {v === "bottom" && <TrendingDown className="w-3 h-3" />}
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          {platforms.length > 1 && (
            <select
              value={filterPlatform}
              onChange={(e) => setFilterPlatform(e.target.value)}
              className="h-8 rounded-lg border border-gray-200 text-xs px-2 text-gray-700 bg-white"
            >
              <option value="all">All platforms</option>
              {platforms.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}
          <span className="text-xs text-gray-400">{sorted.length} accounts</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Account
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Store
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Platform
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                onClick={() => handleSort("spend")}
              >
                Spend <SortIcon col="spend" />
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                onClick={() => handleSort("purchases")}
              >
                Purchases <SortIcon col="purchases" />
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                onClick={() => handleSort("purchaseValue")}
              >
                Revenue <SortIcon col="purchaseValue" />
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                onClick={() => handleSort("roas")}
              >
                ROAS <SortIcon col="roas" />
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                onClick={() => handleSort("costPerPurchase")}
              >
                CPP <SortIcon col="costPerPurchase" />
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                onClick={() => handleSort("ctr")}
              >
                CTR <SortIcon col="ctr" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {sorted.map((row, idx) => (
              <tr
                key={`${row.accountName}|${row.platform}|${idx}`}
                className="hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-3 max-w-[200px]">
                  <p className="text-sm font-medium text-gray-900 truncate" title={row.accountName}>
                    {row.accountName}
                  </p>
                </td>
                <td className="px-4 py-3 max-w-[160px]">
                  <p className="text-xs text-gray-500 truncate" title={row.storeName}>
                    {row.storeName}
                  </p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <PlatformBadge platform={row.platform} />
                </td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 whitespace-nowrap">
                  ${row.spend.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-600 whitespace-nowrap">
                  {row.purchases ?? "—"}
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-600 whitespace-nowrap">
                  {row.purchaseValue !== undefined ? `$${row.purchaseValue.toFixed(2)}` : "—"}
                </td>
                <td className={`px-4 py-3 text-right text-sm whitespace-nowrap ${roasColor(row.roas)}`}>
                  {row.roas !== undefined ? `${row.roas.toFixed(2)}x` : "—"}
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-600 whitespace-nowrap">
                  {row.costPerPurchase !== undefined ? `$${row.costPerPurchase.toFixed(2)}` : "—"}
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-600 whitespace-nowrap">
                  {row.ctr !== undefined ? `${row.ctr.toFixed(2)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
