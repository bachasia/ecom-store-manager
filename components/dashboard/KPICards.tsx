"use client"

import { DollarSign, TrendingUp, Percent, Target } from "lucide-react"
import { useTranslations } from 'next-intl'

interface KPICardsProps {
  revenue: number
  netProfit: number
  profitMargin: number
  roas: number | null
  loading?: boolean
}

export default function KPICards({ 
  revenue, 
  netProfit, 
  profitMargin, 
  roas,
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

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-24 mb-3"></div>
                <div className="h-8 bg-gray-200 rounded w-32"></div>
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
              </div>
              <div className={`w-12 h-12 bg-gradient-to-br ${card.gradient} rounded-xl flex items-center justify-center shadow-sm`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
