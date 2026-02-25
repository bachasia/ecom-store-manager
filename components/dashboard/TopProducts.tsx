"use client"

import { TrendingUp, Package } from "lucide-react"
import { useTranslations } from 'next-intl'

interface TopProduct {
  sku: string
  productName: string
  quantity: number
  orders: number
  revenue: number
  netProfit: number
  profitMargin: number
}

interface TopProductsProps {
  products: TopProduct[]
  loading?: boolean
}

export default function TopProducts({ products, loading = false }: TopProductsProps) {
  const t = useTranslations('topProducts')
  const tCommon = useTranslations('common')

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

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="h-4 bg-gray-200 rounded w-48 mb-6 animate-pulse"></div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 animate-pulse">
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-24"></div>
              </div>
              <div className="h-6 bg-gray-200 rounded w-20"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">{t('title')}</h3>
        <div className="py-12 text-center">
          <Package className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-500">{tCommon('noData')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">{t('title')}</h3>
        <span className="text-sm text-gray-500">{t('byNetProfit')}</span>
      </div>
      
      <div className="space-y-3">
        {products.map((product, index) => (
          <div 
            key={product.sku}
            className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all duration-200"
          >
            <div className="flex items-center space-x-4 flex-1 min-w-0">
              <div className="flex-shrink-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                  index === 0 
                    ? 'bg-gradient-to-br from-yellow-400 to-yellow-500 text-white shadow-sm' 
                    : index === 1
                    ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-white shadow-sm'
                    : index === 2
                    ? 'bg-gradient-to-br from-orange-400 to-orange-500 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {index + 1}
                </div>
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {product.productName}
                </p>
                <div className="flex items-center space-x-3 mt-1">
                  <span className="text-xs text-gray-500">
                    SKU: {product.sku}
                  </span>
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-xs text-gray-500">
                    {product.quantity} {t('sold')}
                  </span>
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-xs text-gray-500">
                    {product.orders} {t('orders')}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4 flex-shrink-0">
              <div className="text-right">
                <p className="text-sm font-bold text-gray-900">
                  {formatCurrency(product.netProfit)}
                </p>
                <p className={`text-xs font-medium ${
                  product.profitMargin >= 30 
                    ? 'text-green-600' 
                    : product.profitMargin >= 15 
                    ? 'text-orange-600' 
                    : 'text-red-600'
                }`}>
                  {formatPercent(product.profitMargin)} margin
                </p>
              </div>
              
              {product.netProfit > 0 && (
                <TrendingUp className="w-5 h-5 text-green-500" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
