"use client"

import { useTranslations } from "next-intl"
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts"

interface ChartRow {
  date: string
  [accountName: string]: number | string // spend per account
}

interface Props {
  rows: {
    date?: string
    accountName?: string
    spend: number
  }[]
  accountNames: string[]
}

// Màu cho từng account
const COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#3b82f6", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
]

export default function AdsSpendChart({ rows, accountNames }: Props) {
  const t = useTranslations("ads")
  // Build chart data — aggregate theo ngày, mỗi account là 1 series
  const dateMap = new Map<string, Record<string, number>>()

  for (const row of rows) {
    if (!row.date) continue
    const existing = dateMap.get(row.date) || {}
    const key = row.accountName || "Total"
    existing[key] = (existing[key] || 0) + row.spend
    dateMap.set(row.date, existing)
  }

  const chartData: ChartRow[] = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...values }))

  const series = accountNames.length > 0 ? accountNames : ["Total"]

  const formatCurrency = (val: number) => `$${val.toFixed(0)}`
  const formatDate = (d: string) => {
    if (!d) return d
    const parts = d.split("-")
    return `${parts[2]}/${parts[1]}`
  }

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        {t("reportNoData")}
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatCurrency}
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip
          formatter={(value: number | undefined, name: string | undefined) => [
            value !== undefined ? `$${value.toFixed(2)}` : "—",
            name ?? "",
          ]}
          labelFormatter={(label) => `${t("reportColDate")}: ${label}`}
          contentStyle={{
            borderRadius: "12px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
        />
        {series.map((acc, i) =>
          series.length > 3 ? (
            <Bar
              key={acc}
              dataKey={acc}
              stackId="spend"
              fill={COLORS[i % COLORS.length]}
              radius={i === series.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
            />
          ) : (
            <Line
              key={acc}
              type="monotone"
              dataKey={acc}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          )
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
