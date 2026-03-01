"use client"

import { useState } from "react"
import { AlertTriangle, TrendingDown, Package, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import Link from "next/link"
import { useUserTimezone } from "@/lib/hooks/useUserTimezone"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NegativeROIAlert {
  date: string
  storeId: string
  storeName: string
  revenue: number
  adsCost: number
  netProfit: number
  roi: number
}

export interface LowROASAlert {
  date: string
  storeId: string
  storeName: string
  adsCost: number
  revenue: number
  roas: number
  threshold: number
}

export interface MissingCOGSAlert {
  productId: string
  sku: string
  productName: string
  storeId: string
  storeName: string
  unitsSold: number
  revenueAtRisk: number
}

export interface AlertsData {
  negativeROI: NegativeROIAlert[]
  lowROAS: LowROASAlert[]
  missingCOGS: MissingCOGSAlert[]
  roasThreshold: number
  summary: {
    negativeROIDays: number
    lowROASDays: number
    missingCOGSCount: number
  }
}

interface AlertsPanelProps {
  data: AlertsData | null
  loading?: boolean
  /** Base path for action links — defaults to /dashboard */
  basePath?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDec = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
})

const fmtShort = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

function formatDate(iso: string, timezone: string): string {
  const d = new Date(iso + "T12:00:00Z")
  return d.toLocaleDateString("en-US", { timeZone: timezone, month: "short", day: "numeric", year: "numeric" })
}

// ── Section wrapper ───────────────────────────────────────────────────────────

interface SectionProps {
  title: string
  count: number
  color: "red" | "orange" | "yellow"
  icon: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}

function Section({ title, count, color, icon, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  const palette = {
    red: {
      header: "bg-red-50 border-red-200",
      title: "text-red-800",
      badge: "bg-red-100 text-red-700",
      icon: "text-red-500",
      border: "border-red-100",
    },
    orange: {
      header: "bg-orange-50 border-orange-200",
      title: "text-orange-800",
      badge: "bg-orange-100 text-orange-700",
      icon: "text-orange-500",
      border: "border-orange-100",
    },
    yellow: {
      header: "bg-yellow-50 border-yellow-200",
      title: "text-yellow-800",
      badge: "bg-yellow-100 text-yellow-700",
      icon: "text-yellow-600",
      border: "border-yellow-100",
    },
  }

  const c = palette[color]

  return (
    <div className={`rounded-2xl border ${c.border} overflow-hidden`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between px-5 py-4 ${c.header} border-b ${c.border} transition-colors hover:brightness-95`}
      >
        <span className="flex items-center gap-3">
          <span className={c.icon}>{icon}</span>
          <span className={`font-semibold ${c.title}`}>{title}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${c.badge}`}>{count}</span>
        </span>
        {open
          ? <ChevronUp className={`h-4 w-4 ${c.icon}`} />
          : <ChevronDown className={`h-4 w-4 ${c.icon}`} />}
      </button>

      {open && (
        <div className="bg-white">
          {count === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400 text-center">No alerts in this period.</p>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-16 rounded-2xl bg-gray-100 animate-pulse" />
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AlertsPanel({ data, loading = false, basePath = "/dashboard" }: AlertsPanelProps) {
  const { timezone } = useUserTimezone()

  if (loading) return <Skeleton />

  if (!data) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-gray-100 bg-white text-sm text-gray-500">
        No alert data available
      </div>
    )
  }

  const { negativeROI, lowROAS, missingCOGS, summary, roasThreshold } = data
  const totalAlerts = summary.negativeROIDays + summary.lowROASDays + summary.missingCOGSCount

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Alert Summary</h3>
        {totalAlerts === 0 ? (
          <p className="text-sm text-green-600 font-medium">No alerts for the selected period.</p>
        ) : (
          <div className="flex flex-wrap gap-4 text-sm">
            {summary.negativeROIDays > 0 && (
              <span className="flex items-center gap-1.5 text-red-600">
                <TrendingDown className="h-4 w-4" />
                <strong>{summary.negativeROIDays}</strong> day{summary.negativeROIDays > 1 ? "s" : ""} with negative ROI
              </span>
            )}
            {summary.lowROASDays > 0 && (
              <span className="flex items-center gap-1.5 text-orange-600">
                <AlertTriangle className="h-4 w-4" />
                <strong>{summary.lowROASDays}</strong> day{summary.lowROASDays > 1 ? "s" : ""} with ROAS below {roasThreshold}
              </span>
            )}
            {summary.missingCOGSCount > 0 && (
              <span className="flex items-center gap-1.5 text-yellow-700">
                <Package className="h-4 w-4" />
                <strong>{summary.missingCOGSCount}</strong> SKU{summary.missingCOGSCount > 1 ? "s" : ""} missing COGS
              </span>
            )}
          </div>
        )}
      </div>

      {/* Section 1: Negative Margin */}
      <Section
        title="Negative Margin Days"
        count={summary.negativeROIDays}
        color="red"
        icon={<TrendingDown className="h-5 w-5" />}
        defaultOpen={summary.negativeROIDays > 0}
      >
        <div className="divide-y divide-gray-50">
          {negativeROI.map((alert) => (
            <div key={`${alert.date}-${alert.storeId}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{formatDate(alert.date, timezone)}</p>
                <p className="text-xs text-gray-500 mt-0.5">{alert.storeName}</p>
              </div>
              <div className="flex items-center gap-6 shrink-0 ml-4">
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-gray-400">Revenue</p>
                  <p className="text-sm text-gray-700">{fmtShort.format(alert.revenue)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Net Profit</p>
                  <p className="text-sm font-semibold text-red-600">{fmtDec.format(alert.netProfit)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Margin</p>
                  <p className="text-sm font-semibold text-red-600">{alert.roi.toFixed(1)}%</p>
                </div>
                <Link
                  href={`${basePath}/orders?startDate=${alert.date}&endDate=${alert.date}&storeId=${alert.storeId}`}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 transition-colors shrink-0"
                >
                  View orders <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Section 2: Low ROAS */}
      <Section
        title={`Low ROAS Days (below ${roasThreshold})`}
        count={summary.lowROASDays}
        color="orange"
        icon={<AlertTriangle className="h-5 w-5" />}
        defaultOpen={summary.lowROASDays > 0 && summary.negativeROIDays === 0}
      >
        <div className="divide-y divide-gray-50">
          {lowROAS.map((alert) => (
            <div key={`${alert.date}-${alert.storeId}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{formatDate(alert.date, timezone)}</p>
                <p className="text-xs text-gray-500 mt-0.5">{alert.storeName}</p>
              </div>
              <div className="flex items-center gap-6 shrink-0 ml-4">
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-gray-400">Ads Spend</p>
                  <p className="text-sm text-gray-700">{fmtShort.format(alert.adsCost)}</p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-gray-400">Revenue</p>
                  <p className="text-sm text-gray-700">{fmtShort.format(alert.revenue)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">ROAS</p>
                  <p className="text-sm font-semibold text-orange-600">{alert.roas.toFixed(2)}</p>
                </div>
                <Link
                  href={`${basePath}/ads?startDate=${alert.date}&endDate=${alert.date}${alert.storeId ? `&storeId=${alert.storeId}` : ""}`}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 transition-colors shrink-0"
                >
                  View ads <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Section 3: Missing COGS */}
      <Section
        title="Missing COGS"
        count={summary.missingCOGSCount}
        color="yellow"
        icon={<Package className="h-5 w-5" />}
        defaultOpen={summary.missingCOGSCount > 0 && summary.negativeROIDays === 0 && summary.lowROASDays === 0}
      >
        <div className="divide-y divide-gray-50">
          {missingCOGS.map((alert) => (
            <div key={`${alert.productId}-${alert.sku}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate" title={alert.productName}>
                  {alert.productName}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{alert.sku} · {alert.storeName}</p>
              </div>
              <div className="flex items-center gap-6 shrink-0 ml-4">
                <div className="text-right">
                  <p className="text-xs text-gray-400">Units sold</p>
                  <p className="text-sm text-gray-700">{alert.unitsSold.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Revenue at risk</p>
                  <p className="text-sm font-semibold text-yellow-700">{fmtShort.format(alert.revenueAtRisk)}</p>
                </div>
                <Link
                  href={`${basePath}/products?search=${encodeURIComponent(alert.sku)}`}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 transition-colors shrink-0"
                >
                  Set COGS <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
