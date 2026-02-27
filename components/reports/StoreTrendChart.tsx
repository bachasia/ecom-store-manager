"use client"

import { useState } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoreMeta {
  id: string
  name: string
  platform: string
}

export interface TrendPoint {
  date: string
  stores: Record<string, { revenue: number; netProfit: number; adsCost: number; roas: number | null }>
}

interface StoreTrendChartProps {
  trends: TrendPoint[]
  stores: StoreMeta[]
  loading?: boolean
}

type MetricKey = "revenue" | "netProfit" | "roas"
type Granularity = "day" | "month"

// ── Palette ───────────────────────────────────────────────────────────────────

const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTick(dateStr: string, granularity: Granularity): string {
  if (granularity === "month") {
    const [y, m] = dateStr.split("-")
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    })
  }
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

const fmtShort = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

const fmtFull = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
})

const metricLabels: Record<MetricKey, string> = {
  revenue: "Revenue",
  netProfit: "Net Profit",
  roas: "ROAS",
}

function Skeleton() {
  return <div className="h-80 animate-pulse rounded-xl bg-gray-100" />
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StoreTrendChart({ trends, stores, loading = false }: StoreTrendChartProps) {
  const [metric, setMetric] = useState<MetricKey>("revenue")
  const [granularity, setGranularity] = useState<Granularity>("day")

  if (loading) return <Skeleton />

  if (!trends || trends.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-gray-100 bg-white text-sm text-gray-500">
        No trend data for selected period
      </div>
    )
  }

  // Aggregate to monthly if granularity = month (trends from API may already be monthly)
  const grouped = new Map<string, Record<string, { revenue: number; netProfit: number; adsCost: number; count: number }>>()

  for (const point of trends) {
    const periodKey =
      granularity === "month" ? point.date.substring(0, 7) : point.date

    const bucket = grouped.get(periodKey) ?? {}
    for (const [storeId, vals] of Object.entries(point.stores)) {
      const prev = bucket[storeId] ?? { revenue: 0, netProfit: 0, adsCost: 0, count: 0 }
      prev.revenue += vals.revenue
      prev.netProfit += vals.netProfit
      prev.adsCost += vals.adsCost
      prev.count += 1
      bucket[storeId] = prev
    }
    grouped.set(periodKey, bucket)
  }

  // Build chart data array
  const chartData = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, storeBucket]) => {
      const row: Record<string, any> = { date: period }
      for (const store of stores) {
        const vals = storeBucket[store.id]
        if (vals) {
          if (metric === "roas") {
            // Tính ROAS từ revenue/adsCost tổng hợp — chính xác hơn arithmetic average
            row[store.id] = vals.adsCost > 0
              ? Math.round((vals.revenue / vals.adsCost) * 100) / 100
              : null
          } else {
            row[store.id] = Math.round((vals[metric] ?? 0) * 100) / 100
          }
        }
      }
      return row
    })

  const tickFormatter =
    metric === "roas"
      ? (v: any) => typeof v === "number" ? v.toFixed(2) : ""
      : (v: any) => typeof v === "number" ? fmtShort.format(v) : ""

  const tooltipFormatter =
    metric === "roas"
      ? (v: any, name: string | undefined) => [Number(v).toFixed(2), name ?? ""]
      : (v: any, name: string | undefined) => [fmtFull.format(Number(v)), name ?? ""]

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6 space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">Store Trends</h3>
        <div className="flex flex-wrap gap-2">
          {/* Metric toggle */}
          <div className="flex rounded-xl border border-gray-200 overflow-hidden">
            {(["revenue", "netProfit", "roas"] as MetricKey[]).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  metric === m
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {metricLabels[m]}
              </button>
            ))}
          </div>

          {/* Granularity toggle */}
          <div className="flex rounded-xl border border-gray-200 overflow-hidden">
            {(["day", "month"] as Granularity[]).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors capitalize ${
                  granularity === g
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {g === "day" ? "Daily" : "Monthly"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => formatTick(v, granularity)}
            style={{ fontSize: "11px" }}
            stroke="#9ca3af"
            tick={{ fill: "#6b7280" }}
          />
          <YAxis
            tickFormatter={tickFormatter}
            style={{ fontSize: "11px" }}
            stroke="#9ca3af"
            tick={{ fill: "#6b7280" }}
          />
          <Tooltip
            formatter={tooltipFormatter}
            labelFormatter={(label) => formatTick(label, granularity)}
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              padding: "10px 14px",
              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
              fontSize: "12px",
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
            formatter={(value) => {
              const store = stores.find((s) => s.id === value)
              return store?.name ?? value
            }}
          />
          {stores.map((store, idx) => (
            <Line
              key={store.id}
              type="monotone"
              dataKey={store.id}
              name={store.id}
              stroke={COLORS[idx % COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
