"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import AdsPerformanceChart from "./AdsPerformanceChart"
import AdsCppTrendChart from "./AdsCppTrendChart"
import TopCampaignsTable from "./TopCampaignsTable"
import AdsAlertsPanel from "./AdsAlertsPanel"
import StoreSelect from "@/components/ui/store-select"
import { useUserTimezone } from "@/lib/hooks/useUserTimezone"
import { getPresetRangeInTimezone } from "@/lib/reports/helpers"

interface Store {
  id: string
  name: string
  platform: string
  myRole: string | null
}

interface AdsReportRow {
  groupKey: string
  date?: string
  accountName?: string
  platform?: string
  storeName?: string
  storeId?: string
  spend: number
  purchases?: number
  purchaseValue?: number
  costPerPurchase?: number
  roas?: number
  ctr?: number
  cpm?: number
  cpc?: number
  rowCount: number
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

interface Summary {
  totalSpend: number
  totalPurchases: number
  totalPurchaseValue: number
  roas: number
  avgCtr?: number
  avgCpm?: number
  avgCpc?: number
  avgCpp?: number
}

interface CompareSummary {
  totalSpend: number
  totalPurchaseValue: number
  roas: number
  avgCtr?: number
  avgCpm?: number
  avgCpc?: number
  avgCpp?: number
}

interface Props {
  stores: Store[]
}

const PRESETS = [
  { labelKey: "reportPreset7" as const, days: 7 },
  { labelKey: "reportPreset30" as const, days: 30 },
  { labelKey: "reportPresetMonth" as const, days: 0, type: "month" as const },
]

function getPresetDates(timezone: string, days: number, type?: "month") {
  if (type === "month") {
    const range = getPresetRangeInTimezone("mtd", timezone)
    return { from: range.startDate, to: range.endDate }
  }

  if (days === 7) {
    const range = getPresetRangeInTimezone("last7", timezone)
    return { from: range.startDate, to: range.endDate }
  }

  const range = getPresetRangeInTimezone("last30", timezone)
  return { from: range.startDate, to: range.endDate }
}

export default function AdsReport({ stores }: Props) {
  const t = useTranslations("ads")
  const { timezone } = useUserTimezone()
  const [selectedStore, setSelectedStore] = useState("")
  const [groupBy, setGroupBy] = useState<"day" | "account" | "platform">("day")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const [rows, setRows] = useState<AdsReportRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [compareSummary, setCompareSummary] = useState<CompareSummary | null>(null)
  const [accountNames, setAccountNames] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)
  // Track which day rows are expanded
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  // Default: last 30 days
  useEffect(() => {
    const { from, to } = getPresetDates(timezone, 30)
    setDateFrom(from)
    setDateTo(to)
  }, [timezone])

  const fetchReport = useCallback(async () => {
    if (!dateFrom || !dateTo) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ from: dateFrom, to: dateTo, groupBy })
      if (selectedStore) params.set("storeId", selectedStore)
      const res = await fetch(`/api/ads/report?${params}`)
      const data = await res.json()

      const fromDate = new Date(`${dateFrom}T00:00:00`)
      const toDate = new Date(`${dateTo}T00:00:00`)
      const dayDiff = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1)
      const prevTo = new Date(fromDate)
      prevTo.setDate(prevTo.getDate() - 1)
      const prevFrom = new Date(fromDate)
      prevFrom.setDate(prevFrom.getDate() - dayDiff)

      const compareParams = new URLSearchParams({
        from: prevFrom.toISOString().slice(0, 10),
        to: prevTo.toISOString().slice(0, 10),
        groupBy,
      })
      if (selectedStore) compareParams.set("storeId", selectedStore)

      const compareRes = await fetch(`/api/ads/report?${compareParams}`)
      const compareData = await compareRes.json()

      if (res.ok) {
        setRows(data.rows)
        setSummary(data.summary)
        setAccountNames(data.accountNames)
        setCompareSummary(compareRes.ok ? compareData.summary : null)
        setFetched(true)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, selectedStore, groupBy])

  // Auto fetch when filters change (debounce-free, dates already set on mount)
  useEffect(() => {
    if (dateFrom && dateTo) {
      fetchReport()
    }
  }, [fetchReport])

  const applyPreset = (days: number, type?: "month") => {
    const { from, to } = getPresetDates(timezone, days, type)
    setDateFrom(from)
    setDateTo(to)
  }

  const toggleExpand = (key: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // KPI card helper
  const KPICard = ({
    label,
    value,
    delta,
  }: {
    label: string
    value: string
    delta?: { label: string; tone: "up" | "down" | "neutral" }
  }) => {
    const deltaTone = {
      up: "bg-emerald-100 text-emerald-700",
      down: "bg-rose-100 text-rose-700",
      neutral: "bg-slate-100 text-slate-600",
    }

    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm shadow-gray-200/70">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">{label}</p>
          {delta && (
            <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold whitespace-nowrap ${deltaTone[delta.tone]}`}>
              {delta.label}
            </span>
          )}
        </div>
        <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
      </div>
    )
  }

  const fmt = (n?: number, decimals = 2) =>
    n !== undefined ? n.toFixed(decimals) : "—"

  const formatDelta = (current?: number, previous?: number, suffix = "%") => {
    if (current === undefined || previous === undefined) return null
    if (previous === 0) {
      if (current === 0) return null
      return { label: t("reportDeltaNew"), tone: "neutral" as const }
    }

    const delta = ((current - previous) / previous) * 100
    const rounded = Math.abs(delta) >= 100 ? Math.round(delta) : Math.round(delta * 10) / 10
    const sign = rounded > 0 ? "+" : ""

    return {
      label: `${sign}${rounded}${suffix} ${t("reportVsPrevious")}`,
      tone: delta > 0 ? "up" as const : delta < 0 ? "down" as const : "neutral" as const,
    }
  }

  const spendDelta = formatDelta(summary?.totalSpend, compareSummary?.totalSpend)
  const revenueDelta = formatDelta(summary?.totalPurchaseValue, compareSummary?.totalPurchaseValue)
  const roasDelta = formatDelta(summary?.roas, compareSummary?.roas)
  const ctrDelta = formatDelta(summary?.avgCtr, compareSummary?.avgCtr)
  const cpcDelta = formatDelta(summary?.avgCpc, compareSummary?.avgCpc)
  const cpmDelta = formatDelta(summary?.avgCpm, compareSummary?.avgCpm)
  const cppDelta = formatDelta(summary?.avgCpp, compareSummary?.avgCpp)

  const StorePlatformIcon = ({ platform }: { platform: string }) => {
    const p = platform?.toLowerCase()
    if (p === "shopbase") {
      return (
        <img
          src="/platform/shopbase-logo32.png"
          alt="ShopBase"
          className="w-4 h-4 rounded object-contain flex-shrink-0"
        />
      )
    }
    if (p === "woocommerce") {
      return (
        <img
          src="/platform/woocommerce-logo32.png"
          alt="WooCommerce"
          className="w-4 h-4 rounded object-contain flex-shrink-0"
        />
      )
    }
    // Fallback: chữ cái đầu
    return (
      <div className="w-4 h-4 rounded bg-gray-300 flex items-center justify-center flex-shrink-0">
        <span className="text-gray-700 text-[8px] font-bold leading-none">{platform?.charAt(0).toUpperCase()}</span>
      </div>
    )
  }

  const PlatformIcon = ({ platform }: { platform: string }) => {
    const p = platform?.toLowerCase()
    if (p === "facebook") {
      return (
        <div className="w-4 h-4 rounded bg-blue-600 flex items-center justify-center flex-shrink-0">
          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
        </div>
      )
    }
    if (p === "google") {
      return (
        <div className="w-4 h-4 rounded bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        </div>
      )
    }
    // Fallback: chữ cái đầu
    return (
      <div className="w-4 h-4 rounded bg-gray-400 flex items-center justify-center flex-shrink-0">
        <span className="text-white text-[8px] font-bold leading-none">{platform?.charAt(0).toUpperCase()}</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">{t("reportTitle")}</h3>

        <div className="flex flex-wrap gap-3">
          {/* Store filter */}
            <div className="w-full sm:w-64">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t("reportFilterStore")}</label>
              <StoreSelect
                value={selectedStore}
                onChange={setSelectedStore}
                placeholder={t("reportFilterAllStores")}
                options={stores.map((s) => ({ value: s.id, label: s.name, platform: s.platform }))}
                className="w-full"
              />
          </div>

          {/* Date range */}
          <div className="flex gap-2 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t("reportFilterFrom")}</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t("reportFilterTo")}</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Presets */}
          <div className="flex items-end gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.labelKey}
                type="button"
                onClick={() => applyPreset(p.days, p.type)}
                className="px-3 py-2 text-xs font-medium rounded-xl border border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>

          {/* Group by */}
          <div className="flex items-end">
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
              {(["day", "account", "platform"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroupBy(g)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    groupBy === g
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {g === "day" ? t("reportGroupDay") : g === "account" ? t("reportGroupAccount") : t("reportGroupPlatform")}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      )}

      {!loading && fetched && (
        <>
          {/* KPI Cards */}
          {summary && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KPICard
                  label={t("reportKpiSpend")}
                  value={`$${summary.totalSpend.toFixed(2)}`}
                  delta={spendDelta ?? undefined}
                />
                <KPICard
                  label={t("reportKpiPurchases")}
                  value={summary.totalPurchases.toString()}
                />
                <KPICard
                  label={t("reportKpiRevenue")}
                  value={`$${summary.totalPurchaseValue.toFixed(2)}`}
                  delta={revenueDelta ?? undefined}
                />
                <KPICard
                  label={t("reportKpiRoas")}
                  value={summary.roas > 0 ? `${summary.roas.toFixed(2)}x` : "—"}
                  delta={roasDelta ?? undefined}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KPICard
                  label={t("reportKpiCtr")}
                  value={summary.avgCtr !== undefined ? `${summary.avgCtr.toFixed(2)}%` : "—"}
                  delta={ctrDelta ?? undefined}
                />
                <KPICard
                  label={t("reportKpiCpc")}
                  value={summary.avgCpc !== undefined ? `$${summary.avgCpc.toFixed(3)}` : "—"}
                  delta={cpcDelta ?? undefined}
                />
                <KPICard
                  label={t("reportKpiCpm")}
                  value={summary.avgCpm !== undefined ? `$${summary.avgCpm.toFixed(2)}` : "—"}
                  delta={cpmDelta ?? undefined}
                />
                <KPICard
                  label={t("reportKpiCpp")}
                  value={summary.avgCpp !== undefined ? `$${summary.avgCpp.toFixed(2)}` : "—"}
                  delta={cppDelta ?? undefined}
                />
              </div>
            </div>
          )}

          {/* Spend vs Revenue vs ROAS chart */}
          {groupBy === "day" && rows.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{t("reportPerfChartTitle")}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{t("reportPerfChartDesc")}</p>
                </div>
              </div>
              <AdsPerformanceChart rows={rows} />
            </div>
          )}

          {groupBy === "day" && rows.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{t("reportCppChartTitle")}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{t("reportCppChartDesc")}</p>
                </div>
              </div>
              <AdsCppTrendChart rows={rows} />
            </div>
          )}

          {/* Top / Bottom Accounts — only when groupBy=account */}
          {groupBy === "account" && rows.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-900">{t("reportTopAccountsTitle")}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{t("reportTopAccountsDesc")}</p>
              </div>
              <TopCampaignsTable rows={rows} />
            </div>
          )}

          {/* Ads Alerts — chỉ khi groupBy=day hoặc account (có accountName data) */}
          {groupBy !== "platform" && rows.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-900">{t("reportAlertsTitle")}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{t("reportAlertsDesc")}</p>
              </div>
              <AdsAlertsPanel
                rows={rows}
                roasThreshold={1.5}
                spendThreshold={50}
                totalSpend={summary?.totalSpend}
              />
            </div>
          )}

          {/* Table — hidden when groupBy=account (TopCampaignsTable covers it) */}
          {groupBy !== "account" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                {t("reportTableTitle")}{" "}
                <span className="ml-1 text-xs font-normal text-gray-400">
                  ({t("reportRowCount", { count: rows.length })})
                </span>
              </h3>
            </div>

            {rows.length === 0 ? (
              <div className="py-14 text-center text-sm text-gray-400">
                {t("reportNoData")}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {/* Expand toggle col — chỉ khi groupBy = day */}
                      {groupBy === "day" && <th className="w-8" />}
                      {groupBy === "day" && (
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          {t("reportColDate")}
                        </th>
                      )}
                      {groupBy === "platform" && (
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          {t("reportColPlatform")}
                        </th>
                      )}
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {t("reportColSpend")}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {t("reportColPurchases")}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {t("reportColRevenue")}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {t("reportColRoas")}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {t("reportColCtr")}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {t("reportColCpm")}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {t("reportColCpc")}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {t("reportColCpp")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((row) => {
                      const roas = row.purchaseValue && row.purchaseValue > 0 && row.spend
                        ? row.purchaseValue / row.spend
                        : (row.roas && row.roas > 0 ? row.roas : undefined)
                      const isExpanded = expandedDays.has(row.groupKey)
                      const hasBreakdown = groupBy === "day" && row.accountBreakdown && row.accountBreakdown.length > 0

                      const roasCell = (roasVal: number | undefined) =>
                        roasVal !== undefined && roasVal > 0 ? (
                          <span className={`font-semibold ${roasVal >= 3 ? "text-green-600" : roasVal >= 2 ? "text-amber-600" : "text-red-500"}`}>
                            {roasVal.toFixed(2)}x
                          </span>
                        ) : <span className="text-gray-300">—</span>

                      return (
                        <React.Fragment key={row.groupKey}>
                          {/* ── Parent row (day summary) ── */}
                          <tr
                            key={row.groupKey}
                            onClick={() => hasBreakdown && toggleExpand(row.groupKey)}
                            className={`transition-colors ${hasBreakdown ? "cursor-pointer hover:bg-indigo-50/50" : "hover:bg-gray-50"} ${isExpanded ? "bg-indigo-100/60 border-l-2 border-indigo-400" : ""}`}
                          >
                            {/* Expand chevron */}
                            {groupBy === "day" && (
                              <td className="pl-3 pr-0 py-3 w-8">
                                {hasBreakdown && (
                                  <svg
                                    className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                )}
                              </td>
                            )}
                            {groupBy === "day" && (
                              <td className="px-4 py-3 whitespace-nowrap font-mono text-xs font-semibold text-gray-700">
                                {row.date}
                              </td>
                            )}
                            {groupBy === "platform" && (
                              <td className="px-4 py-3 text-sm font-medium text-gray-900 capitalize whitespace-nowrap">{row.platform}</td>
                            )}
                            <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">${row.spend.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{row.purchases ?? "—"}</td>
                            <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                              {row.purchaseValue !== undefined ? `$${row.purchaseValue.toFixed(2)}` : "—"}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">{roasCell(roas)}</td>
                            <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{row.ctr !== undefined ? `${fmt(row.ctr, 2)}%` : "—"}</td>
                            <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{row.cpm !== undefined ? `$${fmt(row.cpm, 2)}` : "—"}</td>
                            <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{row.cpc !== undefined ? `$${fmt(row.cpc, 3)}` : "—"}</td>
                            <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{row.costPerPurchase !== undefined ? `$${fmt(row.costPerPurchase, 2)}` : "—"}</td>
                          </tr>

                          {/* ── Sub-rows (account breakdown) — chỉ hiện khi expanded ── */}
                          {isExpanded && row.accountBreakdown?.map((acc) => {
                            const accRoas = acc.roas && acc.roas > 0 ? acc.roas : undefined
                            return (
                              <tr key={`${row.groupKey}|${acc.accountName}`} className="bg-gray-50/80 border-l-2 border-indigo-200">
                                {/* indent */}
                                <td className="pl-3 pr-0 py-2 w-8" />
                                <td className="px-4 py-2 whitespace-nowrap">
                                  <div className="flex items-center gap-2 pl-4">
                                    <div className="flex items-center gap-1">
                                      <StorePlatformIcon platform={acc.storePlatform} />
                                      <PlatformIcon platform={acc.platform} />
                                    </div>
                                    <div>
                                      <p className="text-xs font-medium text-gray-700">{acc.accountName}</p>
                                      <p className="text-xs text-gray-400">{acc.storeName}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-right text-sm font-semibold text-gray-800 whitespace-nowrap">${acc.spend.toFixed(2)}</td>
                                <td className="px-4 py-2 text-right text-sm text-gray-500 whitespace-nowrap">{acc.purchases ?? "—"}</td>
                                <td className="px-4 py-2 text-right text-sm text-gray-500 whitespace-nowrap">
                                  {acc.purchaseValue !== undefined ? `$${acc.purchaseValue.toFixed(2)}` : "—"}
                                </td>
                                <td className="px-4 py-2 text-right whitespace-nowrap">{roasCell(accRoas)}</td>
                                <td className="px-4 py-2 text-right text-sm text-gray-500 whitespace-nowrap">
                                  {acc.ctr !== undefined ? `${fmt(acc.ctr, 2)}%` : "—"}
                                </td>
                                <td className="px-4 py-2 text-right text-sm text-gray-500 whitespace-nowrap">
                                  {acc.cpm !== undefined ? `$${fmt(acc.cpm, 2)}` : "—"}
                                </td>
                                <td className="px-4 py-2 text-right text-sm text-gray-500 whitespace-nowrap">
                                  {acc.cpc !== undefined ? `$${fmt(acc.cpc, 3)}` : "—"}
                                </td>
                                <td className="px-4 py-2 text-right text-sm text-gray-500 whitespace-nowrap">
                                  {acc.costPerPurchase !== undefined ? `$${fmt(acc.costPerPurchase, 2)}` : "—"}
                                </td>
                              </tr>
                            )
                          })}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}
        </>
      )}
    </div>
  )
}
