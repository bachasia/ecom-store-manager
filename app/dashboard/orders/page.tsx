"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { ShoppingCart, Search, RefreshCw, Eye } from "lucide-react"
import StoreSelect from "@/components/ui/store-select"
import DateRangeSelect, { type DatePreset } from "@/components/ui/date-range-select"
import CustomSelect from "@/components/ui/custom-select"

interface Order {
  id: string
  orderNumber: string
  orderDate: string
  status: string
  customerName: string | null
  customerEmail: string | null
  customerCountry?: string | null
  utmMedium?: string | null
  transactionFee?: number
  paymentGateway?: {
    displayName?: string | null
  } | null
  total: number
  refundAmount: number
  netProfit: number
  profitMargin: number
  store: { name: string; platform?: string }
}

interface Store {
  id: string
  name: string
  platform: string
}

function getPlatformIcon(platform?: string): string | null {
  if (platform === "shopbase") return "/platform/shopbase-logo32.png"
  if (platform === "woocommerce") return "/platform/woocommerce-logo32.png"
  return null
}

const toYMD = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const getPresetRange = (preset: Exclude<DatePreset, 'custom'>) => {
  const now = new Date()

  if (preset === 'today') {
    const today = toYMD(now)
    return { startDate: today, endDate: today }
  }

  if (preset === 'yesterday') {
    const d = new Date(now)
    d.setDate(d.getDate() - 1)
    const y = toYMD(d)
    return { startDate: y, endDate: y }
  }

  if (preset === 'mtd') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return { startDate: toYMD(start), endDate: toYMD(now) }
  }

  if (preset === 'last7') {
    const start = new Date(now)
    start.setDate(start.getDate() - 6)
    return { startDate: toYMD(start), endDate: toYMD(now) }
  }

  if (preset === 'last30') {
    const start = new Date(now)
    start.setDate(start.getDate() - 29)
    return { startDate: toYMD(start), endDate: toYMD(now) }
  }

  if (preset === 'lastMonth') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 0)
    return { startDate: toYMD(start), endDate: toYMD(end) }
  }

  if (preset === 'lastYear') {
    const start = new Date(now.getFullYear() - 1, 0, 1)
    const end = new Date(now.getFullYear() - 1, 11, 31)
    return { startDate: toYMD(start), endDate: toYMD(end) }
  }

  // allTime
  return { startDate: '', endDate: toYMD(now) }
}

export default function OrdersPage() {
  const t = useTranslations('orders')
  const tCommon = useTranslations('common')
  const tDashboard = useTranslations('dashboard')
  const [orders, setOrders] = useState<Order[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("")
  const [search, setSearch] = useState("")
  const [datePreset, setDatePreset] = useState<DatePreset>('mtd')
  const [dateRange, setDateRange] = useState(() => getPresetRange('mtd'))
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null)
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 })

  useEffect(() => {
    fetchStores()
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [selectedStore, selectedStatus, search, dateRange, pagination.page])

  const fetchStores = async () => {
    try {
      const response = await fetch("/api/stores")
      const data = await response.json()
      if (response.ok) setStores(data.stores)
    } catch (error) {
      console.error("Error fetching stores:", error)
    }
  }

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(selectedStore && { storeId: selectedStore }),
        ...(selectedStatus && { status: selectedStatus }),
        ...(search && { search }),
        ...(dateRange.startDate && { startDate: dateRange.startDate }),
        ...(dateRange.endDate && { endDate: dateRange.endDate })
      })
      const response = await fetch(`/api/orders?${params}`)
      const data = await response.json()
      if (response.ok) {
        setOrders(data.orders)
        setPagination(data.pagination)
      }
    } catch (error) {
      console.error("Error fetching orders:", error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  const getStatusBadge = (status: string) => {
    const statusLabels: Record<string, string> = {
      completed: t('status.completed'),
      processing: t('status.processing'),
      paid: t('status.paid'),
      pending: t('status.pending'),
      cancelled: t('status.cancelled'),
      refunded: t('status.refunded'),
    }
    const config: Record<string, any> = {
      completed: { bg: 'bg-green-50', text: 'text-green-700' },
      processing: { bg: 'bg-blue-50', text: 'text-blue-700' },
      paid: { bg: 'bg-indigo-50', text: 'text-indigo-700' },
      pending: { bg: 'bg-yellow-50', text: 'text-yellow-700' },
      cancelled: { bg: 'bg-red-50', text: 'text-red-700' },
      refunded: { bg: 'bg-orange-50', text: 'text-orange-700' },
    }
    const c = config[status] || { bg: 'bg-gray-50', text: 'text-gray-700' }
    const label = statusLabels[status] || status
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium ${c.bg} ${c.text}`}>{label}</span>
  }

  const handlePresetChange = (preset: DatePreset) => {
    setDatePreset(preset)
    if (preset !== 'custom') {
      setDateRange(getPresetRange(preset))
      setPagination((p) => ({ ...p, page: 1 }))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">{t('title')}</h2>
        <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={tCommon('search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <button onClick={fetchOrders} className="p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StoreSelect
            value={selectedStore}
            onChange={setSelectedStore}
            placeholder={`${tCommon('all')} ${t('store').toLowerCase()}`}
            options={stores.map((s) => ({
              value: s.id,
              label: s.name,
              platform: s.platform
            }))}
          />
          <CustomSelect
            value={selectedStatus}
            onChange={(v) => { setSelectedStatus(v); setPagination((p) => ({ ...p, page: 1 })) }}
            options={[
              { value: '', label: t('status.all') },
              { value: 'completed', label: t('status.completed') },
              { value: 'processing', label: t('status.processing') },
              { value: 'paid', label: t('status.paid') },
              { value: 'pending', label: t('status.pending') },
              { value: 'cancelled', label: t('status.cancelled') },
              { value: 'refunded', label: t('status.refunded') },
            ]}
          />
          <DateRangeSelect
            value={datePreset}
            onChange={handlePresetChange}
            options={[
              { value: 'today', label: tDashboard('today') },
              { value: 'yesterday', label: tDashboard('yesterday') },
              { value: 'mtd', label: tDashboard('monthToDate') },
              { value: 'last7', label: tDashboard('last7Days') },
              { value: 'last30', label: tDashboard('last30Days') },
              { value: 'lastMonth', label: tDashboard('lastMonth') },
              { value: 'lastYear', label: tDashboard('lastYear') },
              { value: 'allTime', label: tDashboard('allTime') },
              { value: 'custom', label: tDashboard('custom') },
            ]}
          />
          {datePreset === 'custom' ? (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => { setDateRange({ ...dateRange, startDate: e.target.value }); setPagination((p) => ({ ...p, page: 1 })) }}
                className="w-[150px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
              />
              <span className="text-gray-500">-</span>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => { setDateRange({ ...dateRange, endDate: e.target.value }); setPagination((p) => ({ ...p, page: 1 })) }}
                className="w-[150px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
              />
            </div>
          ) : (
            <div />
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="mt-2 text-sm text-gray-600">{tCommon('loading')}</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingCart className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">{t('notFound')}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('orderNumber')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('customerName')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('store')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('total')}</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('profit')}</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Margin</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">#{order.orderNumber}</div>
                        <div className="text-xs text-gray-500">{formatDate(order.orderDate)}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{order.customerName || 'N/A'}</div>
                        <div className="text-xs text-gray-500">{order.customerEmail || 'N/A'}</div>
                        <div className="text-xs text-gray-400">
                          {order.customerCountry || 'N/A'}{order.utmMedium ? ` • ${order.utmMedium}` : ''}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          {getPlatformIcon(order.store.platform) ? (
                            <img
                              src={getPlatformIcon(order.store.platform) || ""}
                              alt={`${order.store.platform} logo`}
                              className="w-4 h-4 rounded-sm"
                            />
                          ) : (
                            <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
                          )}
                          <span>{order.store.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(order.status)}</td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{order.paymentGateway?.displayName || 'N/A'}</div>
                        <div className="text-xs text-gray-400">Fee: {formatCurrency(Number(order.transactionFee || 0))}</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="text-sm font-medium text-gray-900">{formatCurrency(Number(order.total))}</div>
                        {Number(order.refundAmount) > 0 && <div className="text-xs text-red-600">-{formatCurrency(Number(order.refundAmount))}</div>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-sm font-medium ${Number(order.netProfit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(Number(order.netProfit))}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-sm font-medium ${Number(order.profitMargin) >= 30 ? 'text-green-600' : Number(order.profitMargin) >= 15 ? 'text-orange-600' : 'text-red-600'}`}>
                          {Number(order.profitMargin).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => setSelectedOrder(order.id)} className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-700">
                          <Eye className="w-4 h-4 mr-1" />View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination.totalPages > 1 && (
              <div className="px-6 py-4 border-t flex items-center justify-between">
                <div className="text-sm text-gray-500">{t('showing', { count: orders.length, total: pagination.total })}</div>
                <div className="flex items-center space-x-2">
                  <button onClick={() => setPagination({...pagination, page: pagination.page - 1})} disabled={pagination.page === 1} className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-50">{t('previous')}</button>
                  <span className="text-sm">Page {pagination.page} / {pagination.totalPages}</span>
                  <button onClick={() => setPagination({...pagination, page: pagination.page + 1})} disabled={pagination.page === pagination.totalPages} className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-50">{t('next')}</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {selectedOrder && <OrderDetailModal orderId={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </div>
  )
}

function OrderDetailModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const t = useTranslations('orders')
  const tCommon = useTranslations('common')
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/orders/${orderId}`).then(r => r.json()).then(d => { setOrder(d); setLoading(false) })
  }, [orderId])

  const formatCurrency = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="border-b px-6 py-4 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="text-xl font-bold text-gray-900">{t('orderInfo')}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {loading ? (
          <div className="p-12 text-center"><div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
        ) : order ? (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">{t('orderInfo')}</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-gray-500">{t('orderNumber')}</dt><dd className="font-medium">#{order.order.orderNumber}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">{t('storeName')}</dt><dd className="font-medium">{order.order.store.name}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Status:</dt><dd className="font-medium">{order.order.status}</dd></div>
                  <div className="pt-2 border-t" />
                  <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{t('paymentInfo')}</div>
                  <div className="flex justify-between"><dt className="text-gray-500">{t('paymentMethod')}:</dt><dd className="font-medium">{order.order.paymentMethod || 'N/A'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">{t('paymentGateway')}:</dt><dd className="font-medium">{order.order.paymentGateway?.displayName || 'N/A'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">{t('transactionFee')}:</dt><dd className="font-medium">{formatCurrency(Number(order.order.transactionFee || 0))}</dd></div>
                </dl>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">{t('customerName')}</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-gray-500">{t('customerName')}:</dt><dd className="font-medium">{order.order.customerName || 'N/A'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Email:</dt><dd className="font-medium">{order.order.customerEmail || 'N/A'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Country:</dt><dd className="font-medium">{order.order.customerCountry || 'N/A'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Billing:</dt><dd className="font-medium text-right max-w-[320px]">{order.order.billingAddress || 'N/A'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">Shipping:</dt><dd className="font-medium text-right max-w-[320px]">{order.order.shippingAddress || 'N/A'}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">UTM:</dt><dd className="font-medium text-right">{order.order.utmMedium || 'not_set'}{order.order.utmSource ? ` (${order.order.utmSource})` : ''}</dd></div>
                </dl>
              </div>
            </div>
            <div className="border-t pt-6">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">P&L Breakdown</h4>
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div className="flex justify-between text-sm"><span className="text-gray-600">{t('revenue')}:</span><span className="font-semibold">{formatCurrency(order.plBreakdown.revenue)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-600">COGS:</span><span className="font-semibold text-red-600">-{formatCurrency(order.plBreakdown.cogs)}</span></div>
                <div className="flex justify-between text-sm border-t pt-2"><span className="text-gray-600">{t('grossProfit')}:</span><span className="font-semibold">{formatCurrency(order.plBreakdown.grossProfit)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-600">Transaction fee:</span><span className="font-semibold text-red-600">-{formatCurrency(order.plBreakdown.transactionFee)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-600">{t('adCost')}:</span><span className="font-semibold text-red-600">-{formatCurrency(order.plBreakdown.adsCost)}</span></div>
                <div className="flex justify-between text-base border-t-2 pt-3"><span className="font-bold">{t('netProfit')}:</span><span className={`font-bold ${order.plBreakdown.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(order.plBreakdown.netProfit)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-600">{t('profitMargin')}:</span><span className="font-semibold">{order.plBreakdown.profitMargin.toFixed(1)}%</span></div>
              </div>
            </div>
            {order.order.orderItems?.length > 0 && (
              <div className="border-t pt-6">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">{t('products', { count: order.order.orderItems.length })}</h4>
                <div className="space-y-3">
                  {order.order.orderItems.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item.productName}</p>
                        <p className="text-xs text-gray-500">{t('sku', { sku: item.sku, quantity: item.quantity })}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{formatCurrency(Number(item.total))}</p>
                        <p className="text-xs text-gray-500">COGS: {formatCurrency(Number(item.totalCost))}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : <div className="p-12 text-center"><p className="text-sm text-gray-500">{t('notFound')}</p></div>}
      </div>
    </div>
  )
}
