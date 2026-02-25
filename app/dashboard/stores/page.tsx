"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import PlatformSelect from "@/components/ui/platform-select"

interface Store {
  id: string
  name: string
  platform: string
  apiUrl: string
  isActive: boolean
  currency: string
  timezone?: string
  lastSyncAt: string | null
  lastSyncStatus: string | null
  createdAt: string
}

function getPlatformFavicon(platform: string): string {
  if (platform === "shopbase") return "/platform/shopbase-logo32.png"
  if (platform === "woocommerce") return "/platform/woocommerce-logo32.png"
  return ""
}

export default function StoresPage() {
  const t = useTranslations('stores')
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingStore, setEditingStore] = useState<Store | null>(null)

  useEffect(() => {
    fetchStores()
  }, [])

  const fetchStores = async () => {
    try {
      const response = await fetch("/api/stores")
      const data = await response.json()
      if (response.ok) {
        setStores(data.stores)
      }
    } catch (error) {
      console.error("Error fetching stores:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleTestConnection = async (id: string) => {
    try {
      const response = await fetch(`/api/stores/${id}/test`, {
        method: "POST",
      })

      const data = await response.json()

      if (data.success) {
        alert(`✅ ${data.message}`)
      } else {
        alert(`❌ ${data.message}`)
      }
    } catch (error) {
      console.error("Error testing connection:", error)
      alert(t('connectionError'))
    }
  }

  const handleSyncProducts = async (id: string) => {
    if (!confirm(t('confirmSyncProducts'))) return

    try {
      const response = await fetch(`/api/sync/products/${id}`, {
        method: "POST",
      })

      const data = await response.json()

      if (response.ok) {
        alert(`✅ ${data.message}`)
        fetchStores()
      } else {
        alert(`❌ ${data.error}`)
      }
    } catch (error) {
      console.error("Error syncing products:", error)
      alert(t('syncProductsError'))
    }
  }

  const handleSyncOrders = async (id: string) => {
    if (!confirm(t('confirmSyncOrders'))) return

    try {
      const response = await fetch(`/api/sync/orders/${id}`, {
        method: "POST",
      })

      const data = await response.json()

      if (response.ok) {
        alert(`✅ ${data.message}`)
        fetchStores()
      } else {
        alert(`❌ ${data.error}`)
      }
    } catch (error) {
      console.error("Error syncing orders:", error)
      alert(t('syncOrdersError'))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return

    try {
      const response = await fetch(`/api/stores/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        fetchStores()
      } else {
        alert(t('cannotDelete'))
      }
    } catch (error) {
      console.error("Error deleting store:", error)
      alert(t('deleteError'))
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-gray-500">{t('loading')}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">{t('title')}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {t('subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all duration-200"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('addStore')}
        </button>
      </div>

      {showAddForm && (
        <AddStoreForm
          onClose={() => setShowAddForm(false)}
          onSuccess={() => {
            setShowAddForm(false)
            fetchStores()
          }}
        />
      )}

      {editingStore && (
        <EditStoreForm
          store={editingStore}
          onClose={() => setEditingStore(null)}
          onSuccess={() => {
            setEditingStore(null)
            fetchStores()
          }}
        />
      )}

      {stores.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-indigo-100 to-indigo-50 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('noStores')}</h3>
            <p className="text-sm text-gray-500 mb-6">
              {t('noStoresDesc')}
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all duration-200"
            >
              {t('addFirstStore')}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {stores.map((store) => (
            <div key={store.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-all duration-200">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${
                    store.platform === 'shopbase' 
                      ? 'bg-gradient-to-br from-blue-500 to-blue-600' 
                      : 'bg-gradient-to-br from-purple-500 to-purple-600'
                  }`}>
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                      <img
                        src={getPlatformFavicon(store.platform)}
                        alt={`${store.platform} logo`}
                        width={16}
                        height={16}
                        className="h-4 w-4 rounded-sm"
                      />
                      <span>{store.name}</span>
                    </h3>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium ${
                      store.platform === 'shopbase'
                        ? 'bg-blue-50 text-blue-700 border border-blue-100'
                        : 'bg-purple-50 text-purple-700 border border-purple-100'
                    }`}>
                      {store.platform}
                    </span>
                  </div>
                </div>
                {store.isActive ? (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5"></span>
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
                    Inactive
                  </span>
                )}
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <span className="truncate">{store.apiUrl}</span>
                </div>
                
                {store.lastSyncAt && (
                  <div className="flex items-center text-sm">
                    <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-gray-600">
                      {new Date(store.lastSyncAt).toLocaleString("vi-VN")}
                    </span>
                    {store.lastSyncStatus === "success" && (
                      <span className="ml-2 text-green-600 font-medium">✓ Thành công</span>
                    )}
                     {store.lastSyncStatus === "success" && (
                       <span className="ml-2 text-green-600 font-medium">{t('success')}</span>
                     )}
                     {store.lastSyncStatus === "error" && (
                       <span className="ml-2 text-red-600 font-medium">✗ {t('error')}</span>
                     )}
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-2 pt-4 border-t border-gray-100">
                <button
                  onClick={() => handleTestConnection(store.id)}
                  className="flex-1 px-3 py-2 rounded-lg text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 transition-colors duration-200"
                >
                  {t('testConnection')}
                </button>
                <button
                  onClick={() => handleSyncProducts(store.id)}
                  className="flex-1 px-3 py-2 rounded-lg text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-100 transition-colors duration-200"
                >
                  {t('syncProducts')}
                </button>
                <button
                  onClick={() => handleSyncOrders(store.id)}
                  className="flex-1 px-3 py-2 rounded-lg text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-100 transition-colors duration-200"
                >
                  {t('syncOrders')}
                </button>
                <button
                  onClick={() => setEditingStore(store)}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors duration-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(store.id)}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-100 transition-colors duration-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type StoreFormMode = "create" | "edit"

interface StoreFormModalProps {
  mode: StoreFormMode
  store?: Store
  onClose: () => void
  onSuccess: () => void
}

function StoreFormModal({ mode, store, onClose, onSuccess }: StoreFormModalProps) {
  const t = useTranslations('stores')
  const tCommon = useTranslations('common')
  const isEdit = mode === "edit"

  const [formData, setFormData] = useState({
    name: store?.name || "",
    platform: store?.platform || "shopbase",
    apiUrl: store?.apiUrl || "",
    apiKey: "",
    apiSecret: "",
    currency: store?.currency || "USD",
    timezone: store?.timezone || "UTC",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!isEdit && !formData.apiKey.trim()) {
      setError(t('apiKeyPlaceholder'))
      return
    }

    setLoading(true)

    try {
      const payload: any = {
        name: formData.name,
        platform: formData.platform,
        apiUrl: formData.apiUrl,
        currency: formData.currency,
        timezone: formData.timezone,
      }

      if (formData.apiKey.trim()) payload.apiKey = formData.apiKey.trim()
      if (formData.platform === "woocommerce" && formData.apiSecret.trim()) {
        payload.apiSecret = formData.apiSecret.trim()
      }

      const response = await fetch(
        isEdit ? `/api/stores/${store?.id}` : "/api/stores",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || (isEdit ? t('updateError') : t('createError')))
        return
      }

      onSuccess()
    } catch (error) {
      setError(isEdit ? t('updateError') : t('createError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900">
              {isEdit ? `${tCommon('edit')} ${t('storeName')}` : t('addNewStore')}
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 p-4">
              <div className="flex">
                <svg className="w-5 h-5 text-red-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">{t('storeName')}</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="block w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
              placeholder={t('storeNamePlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">{t('platform')}</label>
            <PlatformSelect
              value={formData.platform as "shopbase" | "woocommerce"}
              onChange={(platform) => setFormData({ ...formData, platform })}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">{t('storeUrl')}</label>
            <input
              type="url"
              required
              placeholder="https://your-store.com"
              value={formData.apiUrl}
              onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
              className="block w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">{t('apiKey')}</label>
            <input
              type="text"
              required={!isEdit}
              value={formData.apiKey}
              onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              className="block w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors font-mono text-sm"
              placeholder={t('apiKeyPlaceholder')}
            />
          </div>

          {formData.platform === "woocommerce" && (
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">{t('apiSecret')}</label>
              <input
                type="text"
                value={formData.apiSecret}
                onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
                className="block w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors font-mono text-sm"
                placeholder={t('apiSecretPlaceholder')}
              />
            </div>
          )}

          {isEdit && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 border border-gray-100">
              {t('credentialsOptionalHint')}
            </div>
          )}

          <div className="flex items-center space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {loading ? (isEdit ? t('loading') : t('creating')) : (isEdit ? tCommon('save') : t('create'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditStoreForm({ store, onClose, onSuccess }: { store: Store; onClose: () => void; onSuccess: () => void }) {
  return <StoreFormModal mode="edit" store={store} onClose={onClose} onSuccess={onSuccess} />
}

function AddStoreForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  return <StoreFormModal mode="create" onClose={onClose} onSuccess={onSuccess} />
}
