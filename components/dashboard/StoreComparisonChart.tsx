"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { useTranslations } from "next-intl"

interface StoreComparisonChartProps {
  data: Array<{
    storeId: string
    storeName: string
    platform: string
    revenue: number
    netProfit: number
  }>
  loading?: boolean
}

function getPlatformIcon(platform: string): string | null {
  if (platform === "shopbase") return "/platform/shopbase-logo32.png"
  if (platform === "woocommerce") return "/platform/woocommerce-logo32.png"
  return null
}

const YAXIS_WIDTH = 130
const ICON_SIZE = 14
const GAP = 4

function CustomYAxisTick(props: any) {
  const { x, y, payload, data } = props
  if (!payload) return null

  const storeName: string = payload.value
  const store = (data as StoreComparisonChartProps["data"]).find((d) => d.storeName === storeName)
  const iconUrl = store ? getPlatformIcon(store.platform) : null

  // x là cạnh phải của YAxis, tức là điểm tiếp giáp với chart area
  // Chúng ta vẽ từ x=0 ngược về bên trái
  return (
    <g transform={`translate(${x},${y})`}>
      {iconUrl ? (
        <>
          <image
            href={iconUrl}
            x={-(YAXIS_WIDTH - 4)}
            y={-ICON_SIZE / 2}
            width={ICON_SIZE}
            height={ICON_SIZE}
          />
          <text
            x={-(YAXIS_WIDTH - 4) + ICON_SIZE + GAP}
            y={0}
            dy="0.35em"
            textAnchor="start"
            fill="#6b7280"
            fontSize={12}
          >
            {storeName.length > 11 ? storeName.slice(0, 11) + "…" : storeName}
          </text>
        </>
      ) : (
        <text
          x={-GAP}
          y={0}
          dy="0.35em"
          textAnchor="end"
          fill="#6b7280"
          fontSize={12}
        >
          {storeName.length > 14 ? storeName.slice(0, 14) + "…" : storeName}
        </text>
      )}
    </g>
  )
}

export default function StoreComparisonChart({ data, loading = false }: StoreComparisonChartProps) {
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
        <h3 className="text-lg font-semibold text-gray-900 mb-6">{t("storeComparison")}</h3>
        <div className="h-80 flex items-center justify-center text-sm text-gray-500">{tCommon("noData")}</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">{t("storeComparison")}</h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart layout="vertical" data={data} margin={{ top: 5, right: 16, left: 8, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={formatCurrency}
            stroke="#9ca3af"
            style={{ fontSize: "12px" }}
          />
          <YAxis
            type="category"
            dataKey="storeName"
            width={YAXIS_WIDTH}
            stroke="#9ca3af"
            tick={(props: any) => <CustomYAxisTick {...props} data={data} />}
          />
          <Legend wrapperStyle={{ fontSize: "12px" }} />
          <Tooltip
            formatter={(value: any, name: any) => [formatCurrency(Number(value)), String(name)]}
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              padding: "12px",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            }}
          />
          <Bar dataKey="revenue" name={t("revenue")} fill="#2563eb" radius={[0, 8, 8, 0]} />
          <Bar dataKey="netProfit" name={t("netProfit")} fill="#16a34a" radius={[0, 8, 8, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
