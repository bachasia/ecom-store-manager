"use client"

import { DollarSign, TrendingUp, Percent, Target, Package, ShoppingCart, Megaphone, RotateCcw, ShoppingBag } from "lucide-react"
import { useTranslations } from 'next-intl'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

interface KPICardsProps {
  gmv?: number
  customerRefund?: number
  vendorRefund?: number
  revenue: number
  netProfit: number
  profitMargin: number
  roas: number | null
  cogs?: number
  adsCosts?: number
  totalItemsSold?: number
  itemsPerOrder?: number
  totalOrders?: number
  aov?: number
  revenueTrend?: Array<{
    date: string
    revenue: number
    gmv?: number
    netProfit?: number
    cogs?: number
    itemsSold?: number
    ordersCount?: number
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
  itemsSoldChangePct?: number | null
  ordersChangePct?: number | null
  loading?: boolean
}

export default function KPICards({ 
  gmv = 0,
  customerRefund = 0,
  vendorRefund = 0,
  revenue, 
  netProfit, 
  profitMargin, 
  roas,
  cogs = 0,
  adsCosts = 0,
  totalItemsSold = 0,
  itemsPerOrder = 0,
  totalOrders = 0,
  aov = 0,
  revenueTrend = [],
  netProfitTrend = [],
  profitMarginTrend = [],
  revenueChangePct = null,
  netProfitChangePct = null,
  profitMarginChangePct = null,
  roasChangePct = null,
  itemsSoldChangePct = null,
  ordersChangePct = null,
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

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
  }

  const revenuePerDay = revenueTrend.length > 0 ? revenue / revenueTrend.length : 0

  const renderChange = (pct: number | null) => {
    if (pct === null || Number.isNaN(pct) || !Number.isFinite(pct)) return null
    const rounded = Math.abs(pct) < 0.1 ? 0 : pct
    const isUp = rounded >= 0
    return <span className={`text-sm font-semibold ${isUp ? 'text-green-600' : 'text-red-600'}`}>{isUp ? '↑' : '↓'} {isUp ? '+' : ''}{rounded.toFixed(1)}%</span>
  }

  const marginValues = profitMarginTrend
    .map((d) => Number(d.profitMargin))
    .filter((v) => Number.isFinite(v))
  const marginHigh = marginValues.length > 0 ? Math.max(...marginValues) : null
  const marginLow = marginValues.length > 0 ? Math.min(...marginValues) : null

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
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

  // cards[0] = GMV, cards[1] = Net Revenue, cards[2] = Customer Refund, cards[3] = Vendor Refund
  // cards[4] = Net Profit, cards[5] = Profit Margin, cards[6] = ROAS
  // cards[7] = Items Sold, cards[8] = Total Orders, cards[9] = COGS, cards[10] = Ad Costs
  const cards = [
    {
      title: t('gmv'),
      value: formatCurrency(gmv),
      subtitle: `${formatCurrency(revenuePerDay > 0 ? gmv / revenue * revenuePerDay : 0)}/day`,
      icon: ShoppingBag,
      gradient: "from-emerald-500 to-emerald-600",
      textColor: "text-emerald-600",
      trendDataKey: "gmv",
      trendColor: "#059669",
      trendBg: "bg-emerald-50/70",
      changePct: revenueChangePct, // GMV và revenue thay đổi cùng chiều
    },
    {
      title: t('netRevenue'),
      value: formatCurrency(revenue),
      subtitle: `~${formatCurrency(revenuePerDay)}/day`,
      icon: DollarSign,
      gradient: "from-green-500 to-green-600",
      textColor: "text-green-600",
      trendDataKey: "revenue",
      trendColor: "#16a34a",
      trendBg: "bg-green-50/70",
      changePct: revenueChangePct,
    },
    {
      title: t('customerRefund'),
      value: formatCurrency(customerRefund),
      subtitle: gmv > 0 ? `${((customerRefund / gmv) * 100).toFixed(1)}% of GMV` : null,
      icon: RotateCcw,
      gradient: "from-amber-500 to-amber-600",
      textColor: "text-amber-600",
      trendDataKey: null,
      trendColor: null,
      trendBg: null,
      changePct: null,
    },
    {
      title: t('vendorRefund'),
      value: formatCurrency(vendorRefund),
      subtitle: vendorRefund > 0 ? `+${formatCurrency(vendorRefund)} profit` : null,
      icon: RotateCcw,
      gradient: "from-teal-500 to-teal-600",
      textColor: "text-teal-600",
      trendDataKey: null,
      trendColor: null,
      trendBg: null,
      changePct: null,
    },
    {
      title: t('netProfit'),
      value: formatCurrency(netProfit),
      subtitle: `~${formatCurrency(netProfitTrend.length > 0 ? netProfit / netProfitTrend.length : 0)}/day`,
      icon: TrendingUp,
      gradient: "from-indigo-500 to-indigo-600",
      textColor: "text-indigo-600",
      trendDataKey: "netProfit",
      trendColor: "#4f46e5",
      trendBg: "bg-indigo-50/70",
      changePct: netProfitChangePct,
    },
    {
      title: t('profitMargin'),
      value: formatPercent(profitMargin),
      subtitle: marginHigh !== null && marginLow !== null
        ? `${t('high')}: ${formatPercent(marginHigh)} · ${t('low')}: ${formatPercent(marginLow)}`
        : null,
      icon: Percent,
      gradient: "from-orange-500 to-orange-600",
      textColor: "text-orange-600",
      trendDataKey: "profitMargin",
      trendColor: "#ea580c",
      trendBg: "bg-orange-50/70",
      changePct: profitMarginChangePct,
    },
    {
      title: t('roas'),
      value: formatROAS(roas),
      subtitle: null,
      icon: Target,
      gradient: "from-red-500 to-red-600",
      textColor: "text-red-600",
      trendDataKey: "roas",
      trendColor: "#dc2626",
      trendBg: "bg-red-50/70",
      changePct: roasChangePct,
    },
    {
      title: t('totalItemsSold'),
      value: formatNumber(totalItemsSold),
      subtitle: `~${itemsPerOrder.toFixed(1)} ${t('itemsPerOrder')}`,
      icon: Package,
      gradient: "from-cyan-500 to-cyan-600",
      textColor: "text-cyan-600",
      trendDataKey: "itemsSold",
      trendColor: "#0891b2",
      trendBg: "bg-cyan-50/70",
      changePct: itemsSoldChangePct,
    },
    {
      title: t('totalOrders'),
      value: formatNumber(totalOrders),
      subtitle: `AOV: ${formatCurrency(aov)}`,
      icon: ShoppingCart,
      gradient: "from-violet-500 to-violet-600",
      textColor: "text-violet-600",
      trendDataKey: "ordersCount",
      trendColor: "#7c3aed",
      trendBg: "bg-violet-50/70",
      changePct: ordersChangePct,
    },
    {
      title: t('cogsCard'),
      value: formatCurrency(cogs),
      subtitle: `~${formatCurrency(totalItemsSold > 0 ? cogs / totalItemsSold : 0)}/${t('itemShort')}`,
      icon: DollarSign,
      gradient: "from-slate-500 to-slate-600",
      textColor: "text-slate-600",
      trendDataKey: "cogs",
      trendColor: "#475569",
      trendBg: "bg-slate-50/80",
      changePct: null,
    },
    {
      title: t('adCostsCard'),
      value: formatCurrency(adsCosts),
      subtitle: `~${formatCurrency(revenueTrend.length > 0 ? adsCosts / revenueTrend.length : 0)}/day`,
      icon: Megaphone,
      gradient: "from-rose-500 to-rose-600",
      textColor: "text-rose-600",
      trendDataKey: "adsCosts",
      trendColor: "#e11d48",
      trendBg: "bg-rose-50/80",
      changePct: null,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => {
        const Icon = card.icon
        // Pick the correct trend data array
        const trendData = (['profitMargin'].includes(card.trendDataKey ?? ''))
          ? profitMarginTrend
          : (['netProfit'].includes(card.trendDataKey ?? ''))
            ? netProfitTrend
            : revenueTrend

        return (
          <div 
            key={index}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow duration-200"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500">{card.title}</p>
                <div className="mt-2 flex items-center gap-2">
                  <p className="text-3xl font-bold text-gray-900">{card.value}</p>
                  {card.changePct !== null && renderChange(card.changePct)}
                </div>
                {card.subtitle && (
                  <p className="mt-1 text-xs text-gray-500">{card.subtitle}</p>
                )}
              </div>
              <div className={`w-12 h-12 bg-gradient-to-br ${card.gradient} rounded-xl flex items-center justify-center shadow-sm`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
            </div>

            {card.trendDataKey && card.trendColor && card.trendBg && trendData.length > 0 && (
              <div className={`mt-4 h-14 rounded-lg ${card.trendBg} px-2 py-1`}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <Line
                      type="monotone"
                      dataKey={card.trendDataKey}
                      stroke={card.trendColor}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls={card.trendDataKey === 'roas'}
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
