"use client"

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts"

interface DayRow {
  date?: string
  spend: number
  purchaseValue?: number
  roas?: number
}

interface Props {
  rows: DayRow[]
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{
    color: string
    dataKey: string
    name: string
    value: number | null
  }>
  label?: string
}

export default function AdsPerformanceChart({ rows }: Props) {
  const chartData = rows
    .filter((r) => r.date)
    .map((r) => {
      const spend = r.spend || 0
      const revenue = r.purchaseValue || 0
      const roas =
        r.roas ??
        (spend > 0 && revenue > 0 ? revenue / spend : undefined)
      return {
        date: r.date as string,
        spend,
        revenue,
        roas: roas !== undefined ? Math.round(roas * 100) / 100 : null,
      }
    })

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-52 text-sm text-gray-400">
        No data
      </div>
    )
  }

  const formatDate = (d: string) => {
    const parts = d.split("-")
    return `${parts[2]}/${parts[1]}`
  }

  const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
    if (!active || !payload?.length) return null
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-lg p-3 text-xs space-y-1.5">
        <p className="font-semibold text-gray-700">{label}</p>
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-gray-500">{p.name}:</span>
            <span className="font-medium text-gray-800">
              {p.dataKey === "roas"
                ? p.value !== null
                  ? `${p.value}x`
                  : "—"
                : `$${Number(p.value).toFixed(2)}`}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 48, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
        />
        {/* Left Y — USD */}
        <YAxis
          yAxisId="usd"
          orientation="left"
          tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        {/* Right Y — ROAS */}
        <YAxis
          yAxisId="roas"
          orientation="right"
          tickFormatter={(v) => `${v}x`}
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />

        {/* Spend — stacked bar */}
        <Bar yAxisId="usd" dataKey="spend" name="Spend" fill="#e0e7ff" radius={[3, 3, 0, 0]} maxBarSize={40} />
        {/* Revenue — stacked bar */}
        <Bar yAxisId="usd" dataKey="revenue" name="Revenue" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={40} />
        {/* ROAS — line */}
        <Line
          yAxisId="roas"
          type="monotone"
          dataKey="roas"
          name="ROAS"
          stroke="#f59e0b"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, fill: "#f59e0b" }}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
