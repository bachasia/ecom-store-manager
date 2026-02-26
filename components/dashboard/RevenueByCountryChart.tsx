"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useTranslations } from 'next-intl'

interface RevenueByCountryChartProps {
  data: Array<{
    country: string
    revenue: number
  }>
  loading?: boolean
}

export default function RevenueByCountryChart({ data, loading = false }: RevenueByCountryChartProps) {
  const t = useTranslations('chart')
  const tCommon = useTranslations('common')

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="h-4 bg-gray-200 rounded w-56 mb-6 animate-pulse"></div>
        <div className="h-80 bg-gray-100 rounded-xl animate-pulse"></div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">{t('revenueByCountry')}</h3>
        <div className="h-80 flex items-center justify-center">
          <div className="text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h18M9 3v2m6-2v2M3 10h18M5 5l1 14h12l1-14" />
            </svg>
            <p className="mt-2 text-sm text-gray-500">{tCommon('noData')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">{t('revenueByCountry')}</h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="country" stroke="#9ca3af" style={{ fontSize: '12px' }} />
          <YAxis tickFormatter={formatCurrency} stroke="#9ca3af" style={{ fontSize: '12px' }} />
          <Tooltip
            formatter={(value: any) => formatCurrency(Number(value))}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '12px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            }}
          />
          <Bar dataKey="revenue" name={t('revenue')} fill="#10b981" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
