"use client"

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { useTranslations } from "next-intl"

interface AdsRoasTrendChartProps {
  data: Array<{
    date: string
    adsCosts: number
    roas: number | null
  }>
  loading?: boolean
}

export default function AdsRoasTrendChart({ data, loading = false }: AdsRoasTrendChartProps) {
  const t = useTranslations("chart")
  const tCommon = useTranslations("common")

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="h-4 bg-gray-200 rounded w-56 mb-6 animate-pulse" />
        <div className="h-80 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">{t("adsSpendAndRoasTrend")}</h3>
        <div className="h-80 flex items-center justify-center text-sm text-gray-500">{tCommon("noData")}</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">{t("adsSpendAndRoasTrend")}</h3>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 5, right: 24, left: 12, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tickFormatter={formatDate} stroke="#9ca3af" style={{ fontSize: "12px" }} />
          <YAxis
            yAxisId="left"
            tickFormatter={formatCurrency}
            stroke="#9ca3af"
            style={{ fontSize: "12px" }}
          />
          <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" style={{ fontSize: "12px" }} />
          <Tooltip
            formatter={(value: any, name: any) => {
              if (name === t("roas")) return `${Number(value).toFixed(2)}x`
              return formatCurrency(Number(value))
            }}
            labelFormatter={(label: any) => formatDate(String(label))}
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              padding: "12px",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            }}
          />
          <Legend wrapperStyle={{ paddingTop: "20px" }} />
          <Bar yAxisId="left" dataKey="adsCosts" fill="#f59e0b" name={t("adCosts")} radius={[8, 8, 0, 0]} />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="roas"
            stroke="#2563eb"
            strokeWidth={2.5}
            name={t("roas")}
            connectNulls
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
