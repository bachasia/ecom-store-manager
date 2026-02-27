"use client"

import { useState, useEffect, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as XLSX from "xlsx"
import { FileDown, BarChart2 } from "lucide-react"
import DateRangeSelect, { type DatePreset } from "@/components/ui/date-range-select"
import StoreSelect from "@/components/ui/store-select"
import DailyReportTable, { type DailyRow, type StoreDrilldown } from "@/components/reports/DailyReportTable"
import SKUReportTable, { type SKURow } from "@/components/reports/SKUReportTable"
import StoreComparisonTable, { type StoreComparisonRow } from "@/components/reports/StoreComparisonTable"
import StoreTrendChart, { type TrendPoint, type StoreMeta } from "@/components/reports/StoreTrendChart"
import AlertsPanel, { type AlertsData } from "@/components/reports/AlertsPanel"
import { getAlertCount, getPresetRange } from "@/lib/reports/helpers"

type TabId = "daily" | "sku" | "store" | "alerts"

interface Store {
  id: string
  name: string
  platform: string
}

// ─── Export helper ─────────────────────────────────────────────────────────────
function exportToExcel(data: any[], sheetName: string, filename: string) {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
}

// ─── Skeleton loader ───────────────────────────────────────────────────────────
function TableSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-10 rounded-lg bg-gray-100" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-12 rounded-lg bg-gray-50" />
      ))}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const t = useTranslations("reports")
  const tDash = useTranslations("dashboard")
  const searchParams = useSearchParams()
  const router = useRouter()

  const rawTab = searchParams.get("tab") as TabId | null
  const activeTab: TabId = (["daily", "sku", "store", "alerts"] as TabId[]).includes(rawTab as TabId)
    ? (rawTab as TabId)
    : "daily"

  // ── Stores + filters ──────────────────────────────────────────────────────
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState<string>("")
  const [datePreset, setDatePreset] = useState<DatePreset>("mtd")
  const [dateRange, setDateRange] = useState(() => getPresetRange("mtd"))

  // ── Data states ───────────────────────────────────────────────────────────
  const [dailyData, setDailyData] = useState<DailyRow[]>([])
  const [dailyLoading, setDailyLoading] = useState(false)

  const [skuData, setSkuData] = useState<{
    all: SKURow[]; profitable: SKURow[]; lossmaking: SKURow[]
    total: number; profitableCount: number; lossmakingCount: number
  }>({ all: [], profitable: [], lossmaking: [], total: 0, profitableCount: 0, lossmakingCount: 0 })
  const [skuLoading, setSkuLoading] = useState(false)

  const [storeComparison, setStoreComparison] = useState<StoreComparisonRow[]>([])
  const [storeTrends, setStoreTrends] = useState<TrendPoint[]>([])
  const [storeMetas, setStoreMetas] = useState<StoreMeta[]>([])
  const [storeLoading, setStoreLoading] = useState(false)

  const [alertsData, setAlertsData] = useState<AlertsData | null>(null)
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertCount, setAlertCount] = useState(0)

  // ── Fetch stores ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((json) => {
        if (json.stores) setStores(json.stores.map((s: any) => ({ id: s.id, name: s.name, platform: s.platform })))
      })
      .catch(() => {})
  }, [])

  // ── Fetch per tab ─────────────────────────────────────────────────────────
  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ startDate: dateRange.startDate, endDate: dateRange.endDate })
    if (selectedStore) p.set("storeId", selectedStore)
    return p
  }, [dateRange, selectedStore])

  const fetchDaily = useCallback(async () => {
    setDailyLoading(true)
    try {
      const res = await fetch(`/api/reports/daily?${buildParams()}`)
      const json = await res.json()
      if (res.ok) setDailyData(json.days ?? [])
    } catch {}
    finally { setDailyLoading(false) }
  }, [buildParams])

  const fetchSku = useCallback(async () => {
    setSkuLoading(true)
    try {
      const res = await fetch(`/api/reports/sku?${buildParams()}`)
      const json = await res.json()
      if (res.ok) {
        setSkuData({
          all: json.all ?? [],
          profitable: json.profitable ?? [],
          lossmaking: json.lossmaking ?? [],
          total: (json.all ?? []).length,
          profitableCount: (json.profitable ?? []).length,
          lossmakingCount: (json.lossmaking ?? []).length,
        })
      }
    } catch {}
    finally { setSkuLoading(false) }
  }, [buildParams])

  const fetchStore = useCallback(async () => {
    setStoreLoading(true)
    try {
      const p = buildParams()
      // Fetch comparison (groupBy=total) and trends (groupBy=day) in parallel
      const [resTotal, resDay] = await Promise.all([
        fetch(`/api/reports/store?${p}&groupBy=total`),
        fetch(`/api/reports/store?${p}&groupBy=day`),
      ])
      const [jsonTotal, jsonDay] = await Promise.all([resTotal.json(), resDay.json()])
      if (resTotal.ok) setStoreComparison(jsonTotal.comparison ?? [])
      if (resDay.ok) {
        setStoreTrends(jsonDay.trends ?? [])
        // Extract store metas from comparison data
        const metas: StoreMeta[] = (jsonTotal.comparison ?? []).map((s: any) => ({
          id: s.storeId,
          name: s.storeName,
          platform: s.platform,
        }))
        setStoreMetas(metas)
      }
    } catch {}
    finally { setStoreLoading(false) }
  }, [buildParams])

  const fetchAlerts = useCallback(async () => {
    setAlertsLoading(true)
    try {
      const res = await fetch(`/api/reports/alerts?${buildParams()}`)
      const json = await res.json()
      if (res.ok) {
        setAlertsData(json)
        setAlertCount(getAlertCount(json.summary))
      }
    } catch {}
    finally { setAlertsLoading(false) }
  }, [buildParams])

  // Fetch when tab changes or filters change
  useEffect(() => {
    if (activeTab === "daily") fetchDaily()
    if (activeTab === "sku") fetchSku()
    if (activeTab === "store") fetchStore()
    if (activeTab === "alerts") fetchAlerts()
  }, [activeTab, dateRange, selectedStore])

  // Always keep alert count fresh (background fetch)
  useEffect(() => {
    fetchAlerts()
  }, [dateRange, selectedStore])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleDatePreset = (preset: DatePreset) => {
    setDatePreset(preset)
    if (preset !== "custom") setDateRange(getPresetRange(preset))
  }

  const setTab = (tab: TabId) => {
    const url = new URL(window.location.href)
    url.searchParams.set("tab", tab)
    router.push(url.pathname + url.search)
  }

  const handleExpandRow = async (date: string): Promise<StoreDrilldown[]> => {
    try {
      const p = buildParams()
      p.set("date", date)
      p.set("drilldown", "true")
      const res = await fetch(`/api/reports/daily?${p}`)
      const json = await res.json()
      if (res.ok && json.days?.length > 0) return json.days[0].stores ?? []
    } catch {}
    return []
  }

  const handleExport = () => {
    const suffix = `${dateRange.startDate}-${dateRange.endDate}.xlsx`
    if (activeTab === "daily" && dailyData.length) {
      exportToExcel(
        dailyData.map((d) => ({
          Date: d.date, Orders: d.orders, Revenue: d.revenue, COGS: d.cogs,
          "Ads Cost": d.adsCost, "Transaction Fees": d.transactionFees,
          "Gross Profit": d.grossProfit, "Net Profit": d.netProfit,
          "Margin %": d.profitMargin, ROAS: d.roas ?? "",
        })),
        "Daily", `daily-report-${suffix}`
      )
    } else if (activeTab === "sku" && skuData.all.length) {
      exportToExcel(
        skuData.all.map((s) => ({
          SKU: s.sku, Product: s.productName, Store: s.storeName,
          "Units Sold": s.unitsSold, Revenue: s.revenue, COGS: s.cogs,
          "Ads Cost": s.adsCost, "Net Profit": s.netProfit, "Margin %": s.profitMargin,
        })),
        "SKU", `sku-report-${suffix}`
      )
    } else if (activeTab === "store" && storeComparison.length) {
      exportToExcel(
        storeComparison.map((s) => ({
          Store: s.storeName, Platform: s.platform, Orders: s.orders,
          Revenue: s.revenue, COGS: s.cogs, "Ads Cost": s.adsCost,
          "Net Profit": s.netProfit, "Margin %": s.profitMargin, ROAS: s.roas ?? "",
        })),
        "Stores", `store-report-${suffix}`
      )
    } else if (activeTab === "alerts" && alertsData) {
      const rows = [
        ...(alertsData.negativeROI || []).map((a) => ({
          Type: "Negative ROI", Date: a.date, Store: a.storeName,
          Revenue: a.revenue, "Net Profit": a.netProfit, "Ads Cost": a.adsCost,
        })),
        ...(alertsData.lowROAS || []).map((a) => ({
          Type: "Low ROAS", Date: a.date, Store: a.storeName,
          "Ads Cost": a.adsCost, Revenue: a.revenue, ROAS: a.roas,
        })),
        ...(alertsData.missingCOGS || []).map((a) => ({
          Type: "Missing COGS", SKU: a.sku, Product: a.productName, Store: a.storeName,
          "Units Sold": a.unitsSold, "Revenue at Risk": a.revenueAtRisk,
        })),
      ]
      if (rows.length) exportToExcel(rows, "Alerts", `alerts-report-${suffix}`)
    }
  }

  // ── Options ───────────────────────────────────────────────────────────────
  const dateOptions = [
    { value: "today" as DatePreset, label: tDash("today") },
    { value: "yesterday" as DatePreset, label: tDash("yesterday") },
    { value: "mtd" as DatePreset, label: tDash("monthToDate") },
    { value: "last7" as DatePreset, label: tDash("last7Days") },
    { value: "last30" as DatePreset, label: tDash("last30Days") },
    { value: "lastMonth" as DatePreset, label: tDash("lastMonth") },
    { value: "lastYear" as DatePreset, label: tDash("lastYear") },
  ]

  const storeOptions = [
    { value: "", label: tDash("allStores") },
    ...stores.map((s) => ({ value: s.id, label: s.name, platform: s.platform })),
  ]

  const tabs: { id: TabId; label: string }[] = [
    { id: "daily", label: t("tabs.daily") },
    { id: "sku", label: t("tabs.sku") },
    { id: "store", label: t("tabs.store") },
    { id: "alerts", label: t("tabs.alerts") },
  ]

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-indigo-500 rounded-xl flex items-center justify-center shadow-sm">
            <BarChart2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{t("title")}</h2>
            <p className="text-sm text-gray-500">{t("subtitle")}</p>
          </div>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
        >
          <FileDown className="w-4 h-4" />
          {t("export")}
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <DateRangeSelect
          value={datePreset}
          onChange={handleDatePreset}
          options={dateOptions}
          className="w-52"
        />
        <StoreSelect
          value={selectedStore}
          onChange={setSelectedStore}
          options={storeOptions}
          placeholder={tDash("allStores")}
          className="w-52"
        />
      </div>

      {/* Tab navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`relative px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab.id
                  ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              {tab.label}
              {tab.id === "alerts" && alertCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-xs font-bold rounded-full bg-red-100 text-red-600">
                  {alertCount > 99 ? "99+" : alertCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "daily" && (
          dailyLoading
            ? <TableSkeleton />
            : <DailyReportTable
                data={dailyData}
                loading={dailyLoading}
                onExpandRow={handleExpandRow}
              />
        )}
        {activeTab === "sku" && (
          skuLoading
            ? <TableSkeleton />
            : <SKUReportTable data={skuData} loading={skuLoading} />
        )}
        {activeTab === "store" && (
          <div className="space-y-6">
            {storeLoading
              ? <TableSkeleton />
              : <StoreComparisonTable data={storeComparison} loading={storeLoading} />
            }
            <StoreTrendChart
              trends={storeTrends}
              stores={storeMetas}
              loading={storeLoading}
            />
          </div>
        )}
        {activeTab === "alerts" && (
          <AlertsPanel data={alertsData} loading={alertsLoading} />
        )}
      </div>
    </div>
  )
}
