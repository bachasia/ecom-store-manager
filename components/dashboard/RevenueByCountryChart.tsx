"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useTranslations } from 'next-intl'

const CHART_TOP = 5

interface CountryRow {
  country: string
  revenue: number
  orderCount: number
}

interface RevenueByCountryChartProps {
  data: CountryRow[]
  loading?: boolean
}

export default function RevenueByCountryChart({ data, loading = false }: RevenueByCountryChartProps) {
  const t = useTranslations('chart')
  const tCommon = useTranslations('common')

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)

  const formatCurrencyFull = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)

  const totalRevenue = data.reduce((s, r) => s + r.revenue, 0)

  const chartData  = data.slice(0, CHART_TOP)
  const tableData  = data.slice(CHART_TOP)

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
        <div className="h-4 bg-gray-200 rounded w-56 animate-pulse" />
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-8 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">{t('revenueByCountry')}</h3>
        <div className="h-64 flex items-center justify-center">
          <p className="text-sm text-gray-500">{tCommon('noData')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('revenueByCountry')}</h3>

      {/* Bar chart — top 5 */}
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="country" stroke="#9ca3af" style={{ fontSize: '12px' }} />
          <YAxis tickFormatter={formatCurrency} stroke="#9ca3af" style={{ fontSize: '12px' }} width={72} />
          <Tooltip
            formatter={(value: any) => [formatCurrencyFull(Number(value)), t('revenue')]}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '10px 14px',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08)',
            }}
          />
          <Bar dataKey="revenue" name={t('revenue')} fill="#10b981" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* Table — remaining countries */}
      {tableData.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wider">
                <th className="text-left pb-2 font-medium">{t('country')}</th>
                <th className="text-right pb-2 font-medium">{t('orders')}</th>
                <th className="text-right pb-2 font-medium">{t('revenue')}</th>
                <th className="text-right pb-2 font-medium">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tableData.map((row) => {
                const pct = totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0
                return (
                  <tr key={row.country} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-2 text-gray-700 font-medium">{row.country}</td>
                    <td className="py-2 text-right text-gray-500">{row.orderCount.toLocaleString()}</td>
                    <td className="py-2 text-right text-gray-900 font-medium">{formatCurrencyFull(row.revenue)}</td>
                    <td className="py-2 text-right text-gray-400">{pct.toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
