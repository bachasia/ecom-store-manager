"use client"

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
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
  purchases?: number
  costPerPurchase?: number
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

export default function AdsCppTrendChart({ rows }: Props) {
  const chartData = rows
    .filter((r) => r.date)
    .map((r) => {
      const purchases = r.purchases ?? 0
      const cpp =
        r.costPerPurchase ?? (purchases > 0 && r.spend > 0 ? r.spend / purchases : undefined)

      return {
        date: r.date as string,
        purchases,
        cpp: cpp !== undefined ? Math.round(cpp * 100) / 100 : null,
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
              {p.dataKey === "cpp"
                ? p.value !== null
                  ? `$${Number(p.value).toFixed(2)}`
                  : "-"
                : Number(p.value ?? 0).toFixed(0)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="purchasesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dbeafe" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#dbeafe" stopOpacity={0.15} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="purchases"
          orientation="left"
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <YAxis
          yAxisId="cpp"
          orientation="right"
          tickFormatter={(v) => `$${v}`}
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />
        <Area
          yAxisId="purchases"
          type="monotone"
          dataKey="purchases"
          name="Purchases"
          stroke="#60a5fa"
          fill="url(#purchasesFill)"
          strokeWidth={2}
        />
        <Line
          yAxisId="cpp"
          type="monotone"
          dataKey="cpp"
          name="CPP"
          stroke="#f97316"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, fill: "#f97316" }}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
