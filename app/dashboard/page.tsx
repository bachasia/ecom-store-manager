"use client"

import { useState, useEffect } from "react"
import { useTranslations } from 'next-intl'
import KPICards from "@/components/dashboard/KPICards"
import RevenueChart from "@/components/dashboard/RevenueChart"
import ProfitBreakdownChart from "@/components/dashboard/ProfitBreakdownChart"
import TopProducts from "@/components/dashboard/TopProducts"
import RevenueByCountryChart from "@/components/dashboard/RevenueByCountryChart"
import StoreSelect from "@/components/ui/store-select"

interface Store {
  id: string
  name: string
  platform: string
}

export default function DashboardPage() {
  const t = useTranslations('dashboard')
  
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState<string>("")
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 30 days
    endDate: new Date().toISOString().split('T')[0]
  })
  
  const [plData, setPlData] = useState<any>(null)
  const [chartData, setChartData] = useState<any[]>([])
  const [countryData, setCountryData] = useState<any[]>([])
  const [topProducts, setTopProducts] = useState<any[]>([])
  const [revenueChangePct, setRevenueChangePct] = useState<number | null>(null)
  const [netProfitChangePct, setNetProfitChangePct] = useState<number | null>(null)
  const [profitMarginChangePct, setProfitMarginChangePct] = useState<number | null>(null)
  const [roasChangePct, setRoasChangePct] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStores()
  }, [])

  useEffect(() => {
    if (stores.length > 0) {
      fetchDashboardData()
    }
  }, [selectedStore, dateRange, stores])

  const fetchStores = async () => {
    try {
      const response = await fetch("/api/stores")
      const data = await response.json()
      if (response.ok && data.stores.length > 0) {
        setStores(data.stores)
        setSelectedStore(data.stores[0].id)
      }
    } catch (error) {
      console.error("Error fetching stores:", error)
    }
  }

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      // Fetch aggregate P&L
      const plParams = new URLSearchParams({
        ...(selectedStore && { storeId: selectedStore }),
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        groupBy: 'total'
      })
      const plResponse = await fetch(`/api/pnl?${plParams}`)
      const plResult = await plResponse.json()
      setPlData(plResult)

      // Fetch daily P&L for charts
      const chartParams = new URLSearchParams({
        ...(selectedStore && { storeId: selectedStore }),
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        groupBy: 'day'
      })
      const chartResponse = await fetch(`/api/pnl?${chartParams}`)
      const chartResult = await chartResponse.json()
      setChartData(chartResult.data || [])

      const currentStart = new Date(dateRange.startDate)
      const currentEnd = new Date(dateRange.endDate)
      const dayMs = 24 * 60 * 60 * 1000
      const periodDays = Math.max(1, Math.floor((currentEnd.getTime() - currentStart.getTime()) / dayMs) + 1)
      const prevEnd = new Date(currentStart.getTime() - dayMs)
      const prevStart = new Date(prevEnd.getTime() - (periodDays - 1) * dayMs)

      const prevParams = new URLSearchParams({
        ...(selectedStore && { storeId: selectedStore }),
        startDate: prevStart.toISOString().split('T')[0],
        endDate: prevEnd.toISOString().split('T')[0],
        groupBy: 'total'
      })
      const prevResponse = await fetch(`/api/pnl?${prevParams}`)
      const prevResult = await prevResponse.json()

      const calcPct = (current: number, previous: number): number | null => {
        if (!Number.isFinite(previous) || previous === 0) return null
        return ((current - previous) / Math.abs(previous)) * 100
      }

      setRevenueChangePct(calcPct(Number(plResult?.revenue || 0), Number(prevResult?.revenue || 0)))
      setNetProfitChangePct(calcPct(Number(plResult?.netProfit || 0), Number(prevResult?.netProfit || 0)))
      setProfitMarginChangePct(calcPct(Number(plResult?.profitMargin || 0), Number(prevResult?.profitMargin || 0)))

      const currentRoas = plResult?.roas === null || plResult?.roas === undefined ? null : Number(plResult.roas)
      const prevRoas = prevResult?.roas === null || prevResult?.roas === undefined ? null : Number(prevResult.roas)
      setRoasChangePct(currentRoas === null || prevRoas === null ? null : calcPct(currentRoas, prevRoas))

      // Fetch revenue by country
      const countryParams = new URLSearchParams({
        ...(selectedStore && { storeId: selectedStore }),
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        groupBy: 'country'
      })
      const countryResponse = await fetch(`/api/pnl?${countryParams}`)
      const countryResult = await countryResponse.json()
      setCountryData(countryResult.data || [])

      // Fetch top products
      const productsParams = new URLSearchParams({
        ...(selectedStore && { storeId: selectedStore }),
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        limit: '10'
      })
      const productsResponse = await fetch(`/api/pnl/products?${productsParams}`)
      const productsResult = await productsResponse.json()
      setTopProducts(productsResult.products || [])

    } catch (error) {
      console.error("Error fetching dashboard data:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">{t('title')}</h2>
          <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
        </div>
        
        <div className="flex items-center space-x-3">
          {stores.length > 0 && (
            <StoreSelect
              value={selectedStore}
              onChange={setSelectedStore}
              placeholder={t('allStores')}
              options={stores.map((store) => ({
                value: store.id,
                label: store.name,
                platform: store.platform
              }))}
              className="w-64"
            />
          )}
          
          <div className="flex items-center space-x-2">
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
            <span className="text-gray-500">-</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <KPICards
        revenue={plData?.revenue || 0}
        netProfit={plData?.netProfit || 0}
        profitMargin={plData?.profitMargin || 0}
        roas={plData?.roas}
        revenueTrend={chartData}
        netProfitTrend={chartData}
        profitMarginTrend={chartData}
        revenueChangePct={revenueChangePct}
        netProfitChangePct={netProfitChangePct}
        profitMarginChangePct={profitMarginChangePct}
        roasChangePct={roasChangePct}
        loading={loading}
      />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueChart data={chartData} loading={loading} />
        <ProfitBreakdownChart data={chartData} loading={loading} />
        <RevenueByCountryChart data={countryData} loading={loading} />
      </div>

      {/* Top Products */}
      <TopProducts products={topProducts} loading={loading} />

      {/* Getting Started Guide - Only show if no data */}
      {!loading && stores.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">{t('getStarted')}</h3>
          <div className="space-y-4">
            <div className="flex items-start p-4 rounded-xl bg-gradient-to-r from-indigo-50 to-indigo-50/50 border border-indigo-100">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-500 text-white font-semibold shadow-sm">
                  1
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-semibold text-gray-900">{t('connectStore')}</p>
                <p className="mt-1 text-sm text-gray-600">
                  {t('connectStoreDesc')}
                </p>
              </div>
            </div>
            <div className="flex items-start p-4 rounded-xl hover:bg-gray-50 transition-colors duration-200">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-600 font-semibold">
                  2
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-semibold text-gray-900">{t('syncData')}</p>
                <p className="mt-1 text-sm text-gray-600">
                  {t('syncDataDesc')}
                </p>
              </div>
            </div>
            <div className="flex items-start p-4 rounded-xl hover:bg-gray-50 transition-colors duration-200">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-600 font-semibold">
                  3
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-semibold text-gray-900">{t('configureCosts')}</p>
                <p className="mt-1 text-sm text-gray-600">
                  {t('configureCostsDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
