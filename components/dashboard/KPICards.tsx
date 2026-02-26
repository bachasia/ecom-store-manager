"use client"

import { DollarSign, TrendingUp, Percent, Target } from "lucide-react"
import { useTranslations } from 'next-intl'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

interface KPICardsProps {
  revenue: number
  netProfit: number
  profitMargin: number
  roas: number | null
  revenueTrend?: Array<{
    date: string
    revenue: number
    netProfit?: number
  }>
  netProfitTrend?: Array<{
    date: string
    netProfit: number
  }>
  profitMarginTrend?: Array<{
    date: string
    profitMargin: number
  }>
  revenueChangePct?: number | null
  netProfitChangePct?: number | null
  profitMarginChangePct?: number | null
  roasChangePct?: number | null
  loading?: boolean
}

export default function KPICards({ 
  revenue, 
  netProfit, 
  profitMargin, 
  roas,
  revenueTrend = [],
  netProfitTrend = [],
  profitMarginTrend = [],
  revenueChangePct = null,
  netProfitChangePct = null,
  profitMarginChangePct = null,
  roasChangePct = null,
  loading = false 
}: KPICardsProps) {
  const t = useTranslations('kpi')

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`
  }

  const formatROAS = (value: number | null) => {
    if (value === null) return 'N/A'
    return `${value.toFixed(2)}x`
  }

  const revenuePerDay = revenueTrend.length > 0 ? revenue / revenueTrend.length : 0

  const renderChange = (pct: number | null) => {
    if (pct === null || Number.isNaN(pct) || !Number.isFinite(pct)) return null
    const rounded = Math.abs(pct) < 0.1 ? 0 : pct
    const isUp = rounded >= 0
    return (
      <p className={`mt-1 text-xs font-medium ${isUp ? 'text-green-600' : 'text-red-600'}`}>
        {isUp ? '↑' : '↓'} {isUp ? '+' : ''}{rounded.toFixed(1)}% {t('vsPrevPeriod')}
      </p>
    )
  }

  const marginValues = profitMarginTrend
    .map((d) => Number(d.profitMargin))
    .filter((v) => Number.isFinite(v))
  const marginHigh = marginValues.length > 0 ? Math.max(...marginValues) : null
  const marginLow = marginValues.length > 0 ? Math.min(...marginValues) : null

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-24 mb-3"></div>
                <div className="h-8 bg-gray-200 rounded w-32"></div>
                {i === 1 && (
                  <>
                    <div className="h-4 bg-gray-200 rounded w-20 mt-2"></div>
                    <div className="h-12 bg-gray-100 rounded-lg mt-4"></div>
                  </>
                )}
              </div>
              <div className="w-12 h-12 bg-gray-200 rounded-xl"></div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const cards = [
    {
      title: t('totalRevenue'),
      value: formatCurrency(revenue),
      icon: DollarSign,
      gradient: "from-green-500 to-green-600",
      textColor: "text-green-600",
    },
    {
      title: t('netProfit'),
      value: formatCurrency(netProfit),
      icon: TrendingUp,
      gradient: "from-indigo-500 to-indigo-600",
      textColor: "text-indigo-600",
    },
    {
      title: t('profitMargin'),
      value: formatPercent(profitMargin),
      icon: Percent,
      gradient: "from-orange-500 to-orange-600",
      textColor: "text-orange-600",
    },
    {
      title: t('roas'),
      value: formatROAS(roas),
      icon: Target,
      gradient: "from-red-500 to-red-600",
      textColor: "text-red-600",
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => {
        const Icon = card.icon
        return (
          <div 
            key={index}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow duration-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{card.title}</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{card.value}</p>
                {index === 0 && (
                  <>
                    <p className="mt-1 text-xs text-gray-500">
                      {t('perDay')}: <span className="font-medium text-gray-700">{formatCurrency(revenuePerDay)}</span>
                    </p>
                    {renderChange(revenueChangePct)}
                  </>
                )}
                {index === 1 && (
                  <>
                    <p className="mt-1 text-xs text-gray-500">
                      {t('perDay')}: <span className="font-medium text-gray-700">{formatCurrency(netProfitTrend.length > 0 ? netProfit / netProfitTrend.length : 0)}</span>
                    </p>
                    {renderChange(netProfitChangePct)}
                  </>
                )}
                {index === 2 && renderChange(profitMarginChangePct)}
                {index === 3 && renderChange(roasChangePct)}
                {index === 2 && marginHigh !== null && marginLow !== null && (
                  <p className="mt-1 text-xs text-gray-500">
                    {t('high')}: <span className="font-medium text-green-600">{formatPercent(marginHigh)}</span>
                    {' · '}
                    {t('low')}: <span className="font-medium text-red-600">{formatPercent(marginLow)}</span>
                  </p>
                )}
              </div>
              <div className={`w-12 h-12 bg-gradient-to-br ${card.gradient} rounded-xl flex items-center justify-center shadow-sm`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
            </div>

            {index === 0 && revenueTrend.length > 0 && (
              <div className="mt-4 h-14 rounded-lg bg-green-50/70 px-2 py-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueTrend}>
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#16a34a"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {index === 1 && netProfitTrend.length > 0 && (
              <div className="mt-4 h-14 rounded-lg bg-indigo-50/70 px-2 py-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={netProfitTrend}>
                    <Line
                      type="monotone"
                      dataKey="netProfit"
                      stroke="#4f46e5"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {index === 2 && profitMarginTrend.length > 0 && (
              <div className="mt-4 h-14 rounded-lg bg-orange-50/70 px-2 py-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={profitMarginTrend}>
                    <Line
                      type="monotone"
                      dataKey="profitMargin"
                      stroke="#ea580c"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
