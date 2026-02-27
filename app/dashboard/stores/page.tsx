"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useTranslations } from "next-intl"
import PlatformSelect from "@/components/ui/platform-select"
import AutoSyncSettings from "@/components/stores/AutoSyncSettings"

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
  lastSyncError?: string | null
  createdAt: string
  productCount?: number
  hasPlugin?: boolean
  _count?: {
    products: number
    orders: number
  }
}

interface SyncJob {
  storeId: string
  storeName: string
  type: "products" | "orders"
  status: "running" | "success" | "error" | "cancelled"
  message: string
  startedAt: Date
  hidden: boolean
}

function getPlatformFavicon(platform: string): string {
  if (platform === "shopbase") return "/platform/shopbase-logo32.png"
  if (platform === "woocommerce") return "/platform/woocommerce-logo32.png"
  return ""
}

// Spinner SVG
function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ─── Sync Progress Dialog ────────────────────────────────────────────────────
interface SyncProgressDialogProps {
  job: SyncJob
  onHide: () => void
  onCancel: () => void
  onClose: () => void
}

function SyncProgressDialog({ job, onHide, onCancel, onClose }: SyncProgressDialogProps) {
  const t = useTranslations("stores")
  const [elapsed, setElapsed] = useState(
    Math.round((Date.now() - job.startedAt.getTime()) / 1000)
  )

  useEffect(() => {
    if (job.status !== "running") return
    const id = setInterval(() => {
      setElapsed(Math.round((Date.now() - job.startedAt.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [job.status, job.startedAt])

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">
            {job.type === "products" ? t("syncProducts") : t("syncOrders")}
          </h3>
          {job.status === "running" && (
            <button
              onClick={onHide}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              {t("hideAndRunBackground")}
            </button>
          )}
          {job.status !== "running" && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-4">
          {/* Store info */}
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <span className="font-medium text-gray-800">{job.storeName}</span>
          </div>

          {/* Status */}
          {job.status === "running" && (
            <div className="flex items-center gap-3 rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3">
              <Spinner className="w-5 h-5 text-indigo-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-indigo-800">{t("syncing")}</p>
                <p className="text-xs text-indigo-600 mt-0.5">{t("elapsedSeconds", { seconds: elapsed })}</p>
              </div>
            </div>
          )}

          {job.status === "cancelled" && (
            <div className="flex items-start gap-3 rounded-xl bg-yellow-50 border border-yellow-100 px-4 py-3">
              <svg className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <div>
                <p className="text-sm font-medium text-yellow-800">{t("cancelled")}</p>
                <p className="text-xs text-yellow-700 mt-0.5">{job.message}</p>
              </div>
            </div>
          )}

          {job.status === "success" && (
            <div className="flex items-start gap-3 rounded-xl bg-green-50 border border-green-100 px-4 py-3">
              <svg className="w-5 h-5 text-green-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-green-800">{t("completed")}</p>
                <p className="text-xs text-green-700 mt-0.5">{job.message}</p>
              </div>
            </div>
          )}

          {job.status === "error" && (
            <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-100 px-4 py-3">
              <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-red-800">{t("error")}</p>
                <p className="text-xs text-red-700 mt-0.5">{job.message}</p>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {job.status === "running" && (
            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full animate-pulse" style={{ width: "100%" }} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex gap-2">
          {job.status === "running" && (
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
            >
              {t("stopSync")}
            </button>
          )}
          {job.status !== "running" && (
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gray-900 text-sm font-semibold text-white hover:bg-gray-700 transition-colors"
            >
              {t("close")}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Background sync toast indicator ────────────────────────────────────────
interface BackgroundSyncBadgeProps {
  jobs: SyncJob[]
  onShow: (storeId: string, type: string) => void
  onCancel: (key: string) => void
}

function BackgroundSyncBadge({ jobs, onShow, onCancel }: BackgroundSyncBadgeProps) {
  const t = useTranslations("stores")
  const runningJobs = jobs.filter((j) => j.status === "running" && j.hidden)
  if (runningJobs.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-2">
      {runningJobs.map((job) => {
        const key = `${job.storeId}-${job.type}`
        return (
          <div
            key={key}
            className="flex items-center gap-2 bg-white border border-indigo-200 shadow-lg rounded-xl pl-4 pr-2 py-2.5 text-sm text-indigo-700 font-medium"
          >
            <Spinner className="w-4 h-4 text-indigo-600 shrink-0" />
            <button
              onClick={() => onShow(job.storeId, job.type)}
              className="hover:text-indigo-900 transition-colors"
            >
              {job.storeName} — {job.type === "products" ? t("syncProducts") : t("syncOrders")}
            </button>
            <button
              onClick={() => onCancel(key)}
              title={t("stopSync")}
              className="ml-1 p-1 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function StoresPage() {
  const t = useTranslations("stores")
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingStore, setEditingStore] = useState<Store | null>(null)

  // Map: `${storeId}-${type}` → SyncJob
  const [syncJobs, setSyncJobs] = useState<Map<string, SyncJob>>(new Map())
  const [visibleJobKey, setVisibleJobKey] = useState<string | null>(null)

  // Polling refs — store interval ids
  const pollRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())
  // AbortController refs — để cancel fetch đang chạy
  const abortRefs = useRef<Map<string, AbortController>>(new Map())

  const fetchStores = useCallback(async () => {
    try {
      const response = await fetch("/api/stores")
      const data = await response.json()
      if (response.ok) setStores(data.stores)
    } catch (error) {
      console.error("Error fetching stores:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  // Cleanup polls và abort controllers on unmount
  useEffect(() => {
    return () => {
      pollRefs.current.forEach((id) => clearInterval(id))
      abortRefs.current.forEach((ctrl) => ctrl.abort())
    }
  }, [])

  const updateJob = (key: string, patch: Partial<SyncJob>) => {
    setSyncJobs((prev) => {
      const next = new Map(prev)
      const existing = next.get(key)
      if (existing) next.set(key, { ...existing, ...patch })
      return next
    })
  }

  const stopPoll = (key: string) => {
    const id = pollRefs.current.get(key)
    if (id) {
      clearInterval(id)
      pollRefs.current.delete(key)
    }
  }

  const cancelSync = async (key: string) => {
    const job = syncJobs.get(key)
    if (!job || job.status !== "running") return

    // 1. Ghi flag 'cancelling' vào DB — server loop sẽ đọc và dừng
    try {
      await fetch(`/api/sync/cancel/${job.storeId}`, { method: "POST" })
    } catch {
      // ignore — vẫn abort phía client
    }

    // 2. Abort HTTP connection phía client
    const ctrl = abortRefs.current.get(key)
    if (ctrl) {
      ctrl.abort()
      abortRefs.current.delete(key)
    }

    stopPoll(key)
    updateJob(key, { status: "cancelled", message: t("cancelledByUser") })
    fetchStores()
  }

  const cancelStoreSync = async (storeId: string) => {
    const runningKeys = Array.from(syncJobs.entries())
      .filter(([key, job]) => key.startsWith(`${storeId}-`) && job.status === "running")
      .map(([key]) => key)

    try {
      await fetch(`/api/sync/cancel/${storeId}`, { method: "POST" })
    } catch {
      // ignore
    }

    for (const key of runningKeys) {
      const ctrl = abortRefs.current.get(key)
      if (ctrl) {
        ctrl.abort()
        abortRefs.current.delete(key)
      }
      stopPoll(key)
      updateJob(key, { status: "cancelled", message: t("cancelled") })
    }

    fetchStores()
  }

  const startSync = async (store: Store, type: "products" | "orders") => {
    if (store.lastSyncStatus === "in_progress" || store.lastSyncStatus === "cancelling") {
      return
    }

    const key = `${store.id}-${type}`

    // Nếu đang chạy rồi thì show lại dialog (kể cả khi đang hidden)
    const existing = syncJobs.get(key)
    if (existing?.status === "running") {
      updateJob(key, { hidden: false })
      setVisibleJobKey(key)
      return
    }

    // Tạo AbortController mới cho request này
    const abortCtrl = new AbortController()
    abortRefs.current.set(key, abortCtrl)

    // Tạo job mới
    const job: SyncJob = {
      storeId: store.id,
      storeName: store.name,
      type,
      status: "running",
      message: "Đang kết nối...",
      startedAt: new Date(),
      hidden: false,
    }
    setSyncJobs((prev) => new Map(prev).set(key, job))
    setVisibleJobKey(key)

    // Gọi API sync với signal để có thể abort
    const syncUrl = `/api/sync/${type}/${store.id}`

    fetch(syncUrl, {
      method: "POST",
      signal: abortCtrl.signal,
    })
      .then(async (res) => {
        abortRefs.current.delete(key)
        stopPoll(key)
        const data = await res.json()
        if (res.ok) {
          updateJob(key, { status: "success", message: data.message || "Hoàn thành" })
        } else {
          updateJob(key, { status: "error", message: data.error || "Có lỗi xảy ra" })
        }
        fetchStores()
      })
      .catch((err) => {
        abortRefs.current.delete(key)
        stopPoll(key)
        // AbortError = user cancel, không phải lỗi thật
        if (err.name !== "AbortError") {
          updateJob(key, { status: "error", message: err.message || "Có lỗi xảy ra" })
        }
      })

    // Interval để elapsed time trong dialog tự cập nhật
    const intervalId = setInterval(() => {
      setSyncJobs((prev) => {
        const j = prev.get(key)
        if (!j || j.status !== "running") {
          clearInterval(intervalId)
          return prev
        }
        return new Map(prev).set(key, { ...j })
      })
    }, 1000)
    pollRefs.current.set(key, intervalId)
  }

  const handleTestConnection = async (id: string) => {
    try {
      const response = await fetch(`/api/stores/${id}/test`, { method: "POST" })
      const data = await response.json()
      if (!response.ok) {
        alert(`❌ ${data.error || t("connectionError")}`)
        return
      }
      if (data.success) {
        alert(`✅ ${data.message}`)
      } else {
        alert(`❌ ${data.message}`)
      }
    } catch (error) {
      console.error("Error testing connection:", error)
      alert(t("connectionError"))
    }
  }

  const handleClearData = async (store: Store) => {
    const count = (store._count?.products ?? 0) + (store._count?.orders ?? 0)
    if (!confirm(t("confirmClearData", { name: store.name, count }))) return
    try {
      const response = await fetch(`/api/stores/${store.id}/data`, { method: "DELETE" })
      const data = await response.json()
      if (response.ok) {
        alert(`✅ ${data.message}`)
        fetchStores()
      } else {
        alert(`❌ ${data.error || t("clearDataError")}`)
      }
    } catch (error) {
      console.error("Error clearing store data:", error)
      alert(t("clearDataError"))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t("confirmDelete"))) return
    try {
      const response = await fetch(`/api/stores/${id}`, { method: "DELETE" })
      if (response.ok) {
        fetchStores()
      } else {
        alert(t("cannotDelete"))
      }
    } catch (error) {
      console.error("Error deleting store:", error)
      alert(t("deleteError"))
    }
  }

  const visibleJob = visibleJobKey ? syncJobs.get(visibleJobKey) : undefined

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-gray-500">{t("loading")}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">{t("title")}</h2>
          <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all duration-200"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t("addStore")}
        </button>
      </div>

      {/* Modals */}
      {showAddForm && (
        <AddStoreForm
          onClose={() => setShowAddForm(false)}
          onSuccess={() => { setShowAddForm(false); fetchStores() }}
        />
      )}
      {editingStore && (
        <EditStoreForm
          store={editingStore}
          onClose={() => setEditingStore(null)}
          onSuccess={() => { setEditingStore(null); fetchStores() }}
        />
      )}

      {/* Sync progress dialog */}
      {visibleJob && !visibleJob.hidden && (
        <SyncProgressDialog
          job={visibleJob}
          onHide={() => {
            updateJob(visibleJobKey!, { hidden: true })
            setVisibleJobKey(null)
          }}
          onCancel={() => {
            cancelSync(visibleJobKey!)
          }}
          onClose={() => {
            setSyncJobs((prev) => {
              const next = new Map(prev)
              next.delete(visibleJobKey!)
              return next
            })
            setVisibleJobKey(null)
          }}
        />
      )}

      {/* Background sync badges */}
      <BackgroundSyncBadge
        jobs={Array.from(syncJobs.values())}
        onShow={(storeId, type) => {
          const key = `${storeId}-${type}`
          updateJob(key, { hidden: false })
          setVisibleJobKey(key)
        }}
        onCancel={(key) => cancelSync(key)}
      />

      {/* Store list */}
      {stores.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-indigo-100 to-indigo-50 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t("noStores")}</h3>
            <p className="text-sm text-gray-500 mb-6">{t("noStoresDesc")}</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all duration-200"
            >
              {t("addFirstStore")}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {stores.map((store) => {
            const productJobKey = `${store.id}-products`
            const orderJobKey = `${store.id}-orders`
            const productJob = syncJobs.get(productJobKey)
            const orderJob = syncJobs.get(orderJobKey)
            const storeSyncing = store.lastSyncStatus === "in_progress" || store.lastSyncStatus === "cancelling"
            const productSyncing = productJob?.status === "running"
            const orderSyncing = orderJob?.status === "running"

            return (
              <div key={store.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-all duration-200">
                {/* Store header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${
                      store.platform === "shopbase"
                        ? "bg-gradient-to-br from-blue-500 to-blue-600"
                        : "bg-gradient-to-br from-purple-500 to-purple-600"
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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium ${
                          store.platform === "shopbase"
                            ? "bg-blue-50 text-blue-700 border border-blue-100"
                            : "bg-purple-50 text-purple-700 border border-purple-100"
                        }`}>
                          {store.platform}
                        </span>
                        {store.hasPlugin && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" title={t("pluginConnected")}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            {t("pluginBadge")}
                          </span>
                        )}
                      </div>
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

                {/* Store meta */}
                <div className="space-y-3 mb-4">
                  <div className="flex items-center text-sm text-gray-600">
                    <svg className="w-4 h-4 mr-2 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    <span className="truncate">{store.apiUrl}</span>
                  </div>

                  {/* Product & Order count */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" />
                      </svg>
                      <span className="font-semibold text-gray-700">
                        {t('productCount', { count: store.productCount ?? 0 })}
                      </span>
                    </div>
                    <span className="text-gray-200">|</span>
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      <span className="font-semibold text-gray-700">
                        {t('orderCount', { count: store._count?.orders ?? 0 })}
                      </span>
                    </div>
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
                        <span className="ml-2 text-green-600 font-medium">{t("success")}</span>
                      )}
                      {store.lastSyncStatus === "error" && (
                        <span className="ml-2 text-red-600 font-medium">{t("error")}</span>
                      )}
                    </div>
                  )}

                  {/* Auto Sync Settings — chỉ ShopBase */}
                  {store.platform === "shopbase" && (
                    <AutoSyncSettings storeId={store.id} platform={store.platform} />
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center space-x-2 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => handleTestConnection(store.id)}
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 transition-colors duration-200"
                  >
                    {t("testConnection")}
                  </button>

                  {/* Sync Products */}
                  <button
                    onClick={() => {
                      if (storeSyncing) return
                      startSync(store, "products")
                    }}
                    disabled={storeSyncing}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors duration-200 ${
                      productSyncing
                        ? "text-green-600 bg-green-50 border-green-200 cursor-not-allowed"
                        : storeSyncing
                        ? "text-gray-400 bg-gray-50 border-gray-200 cursor-not-allowed"
                        : "text-green-700 bg-green-50 hover:bg-green-100 border-green-100"
                    }`}
                  >
                    {productSyncing ? (
                      <>
                        <Spinner className="w-3.5 h-3.5 text-green-600" />
                        <span>{t("syncing")}</span>
                      </>
                    ) : storeSyncing ? (
                      <>
                        <Spinner className="w-3.5 h-3.5 text-gray-400" />
                        <span>{t("syncing")}</span>
                      </>
                    ) : (
                      <span className="flex items-center gap-1">
                        {t("syncProducts")}
                        {store.hasPlugin && (
                          <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        )}
                      </span>
                    )}
                  </button>

                  {/* Sync Orders */}
                  <button
                    onClick={() => {
                      if (storeSyncing) return
                      startSync(store, "orders")
                    }}
                    disabled={storeSyncing}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors duration-200 ${
                      orderSyncing
                        ? "text-orange-600 bg-orange-50 border-orange-200 cursor-not-allowed"
                        : storeSyncing
                        ? "text-gray-400 bg-gray-50 border-gray-200 cursor-not-allowed"
                        : "text-orange-700 bg-orange-50 hover:bg-orange-100 border-orange-100"
                    }`}
                  >
                    {orderSyncing ? (
                      <>
                        <Spinner className="w-3.5 h-3.5 text-orange-600" />
                        <span>{t("syncing")}</span>
                      </>
                    ) : storeSyncing ? (
                      <>
                        <Spinner className="w-3.5 h-3.5 text-gray-400" />
                        <span>{t("syncing")}</span>
                      </>
                    ) : (
                      <span className="flex items-center gap-1">
                        {t("syncOrders")}
                        {store.hasPlugin && (
                          <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        )}
                      </span>
                    )}
                  </button>

                  {storeSyncing && (
                    <button
                      onClick={() => cancelStoreSync(store.id)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border text-red-700 bg-red-50 hover:bg-red-100 border-red-100 transition-colors duration-200"
                    >
                      {t("stopSync")}
                    </button>
                  )}

                  <button
                    onClick={() => setEditingStore(store)}
                    title={t("edit")}
                    className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors duration-200"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleClearData(store)}
                    title={t("clearData")}
                    className="px-3 py-2 rounded-lg text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-100 transition-colors duration-200"
                  >
                    {/* Eraser icon */}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 20H7L3 16l10-10 7 7-2.5 2.5" />
                      <path d="M6.0 11.0l7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(store.id)}
                    title={t("deleteStore")}
                    className="px-3 py-2 rounded-lg text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-100 transition-colors duration-200"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Store Form ──────────────────────────────────────────────────────────────
type StoreFormMode = "create" | "edit"

interface StoreFormModalProps {
  mode: StoreFormMode
  store?: Store
  storeId?: string  // needed for webhook URL
  onClose: () => void
  onSuccess: () => void
}

function StoreFormModal({ mode, store, storeId, onClose, onSuccess }: StoreFormModalProps) {
  const t = useTranslations("stores")
  const tCommon = useTranslations("common")
  const isEdit = mode === "edit"

  const [formData, setFormData] = useState({
    name: store?.name || "",
    platform: store?.platform || "shopbase",
    apiUrl: store?.apiUrl || "",
    apiKey: "",
    apiSecret: "",
    pluginSecret: "",
    currency: store?.currency || "USD",
    timezone: store?.timezone || "UTC",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [testingPlugin, setTestingPlugin] = useState(false)
  const [pluginTestResult, setPluginTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [webhookCopied, setWebhookCopied] = useState(false)

  const webhookUrl = typeof window !== 'undefined' && storeId
    ? `${window.location.origin}/api/webhooks/wc-plugin/${storeId}`
    : storeId ? `/api/webhooks/wc-plugin/${storeId}` : ''

  const handleTestPlugin = async () => {
    if (!storeId) return
    setTestingPlugin(true)
    setPluginTestResult(null)
    try {
      const res = await fetch(`/api/stores/${storeId}/test?plugin=1`, { method: "POST" })
      const data = await res.json()
      setPluginTestResult({ success: data.success, message: data.message })
    } catch {
      setPluginTestResult({ success: false, message: t("connectionError") })
    } finally {
      setTestingPlugin(false)
    }
  }

  const handleCopyWebhook = async () => {
    if (!webhookUrl) return
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setWebhookCopied(true)
      setTimeout(() => setWebhookCopied(false), 2000)
    } catch {
      // fallback: select text
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!isEdit && !formData.apiKey.trim()) {
      setError(t("apiKeyPlaceholder"))
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
      if (formData.apiSecret.trim()) payload.apiSecret = formData.apiSecret.trim()
      // Send pluginSecret even if empty (empty = remove)
      if (isEdit || formData.pluginSecret.trim()) {
        payload.pluginSecret = formData.pluginSecret.trim()
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
        setError(data.error || (isEdit ? t("updateError") : t("createError")))
        return
      }

      onSuccess()
    } catch {
      setError(isEdit ? t("updateError") : t("createError"))
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
              {isEdit ? `${tCommon("edit")} ${t("storeName")}` : t("addNewStore")}
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
            <label className="block text-sm font-semibold text-gray-900 mb-2">{t("storeName")}</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="block w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
              placeholder={t("storeNamePlaceholder")}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">{t("platform")}</label>
            <PlatformSelect
              value={formData.platform as "shopbase" | "woocommerce"}
              onChange={(platform) => setFormData({ ...formData, platform })}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">{t("storeUrl")}</label>
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
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              {t("apiKey")}
              {!isEdit && <span className="text-red-500 ml-1">*</span>}
            </label>
            <input
              type="text"
              required={!isEdit}
              value={formData.apiKey}
              onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              className="block w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors font-mono text-sm"
              placeholder={t("apiKeyPlaceholder")}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              {formData.platform === "shopbase" ? t("apiPassword") : t("apiSecret")}
              {!isEdit && <span className="text-red-500 ml-1">*</span>}
            </label>
            <input
              type="text"
              required={!isEdit}
              value={formData.apiSecret}
              onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
              className="block w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors font-mono text-sm"
              placeholder={formData.platform === "shopbase" ? t("apiPasswordPlaceholder") : t("apiSecretPlaceholder")}
            />
          </div>

          {isEdit && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 border border-gray-100">
              {t("credentialsOptionalHint")}
            </div>
          )}

          {/* PNL Plugin Section — WooCommerce only */}
          {formData.platform === "woocommerce" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="text-sm font-semibold text-emerald-800">{t("pluginSection")}</span>
                </div>
                <a
                  href="/downloads/pnl-sync.zip"
                  download
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900 bg-white border border-emerald-200 rounded-lg px-2.5 py-1 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {t("downloadPlugin")}
                </a>
              </div>

              <p className="text-xs text-emerald-700">{t("pluginDesc")}</p>

              {/* Plugin Secret input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-700">{t("pluginSecret")}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.pluginSecret}
                    onChange={(e) => { setFormData({ ...formData, pluginSecret: e.target.value }); setPluginTestResult(null) }}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-colors font-mono text-xs"
                    placeholder={t("pluginSecretPlaceholder")}
                  />
                  {isEdit && storeId && (
                    <button
                      type="button"
                      onClick={handleTestPlugin}
                      disabled={testingPlugin}
                      className="px-3 py-2 rounded-lg text-xs font-semibold border bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {testingPlugin ? t("testingPlugin") : t("testPlugin")}
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">{t("pluginSecretHint")}</p>

                {/* Plugin test result */}
                {pluginTestResult && (
                  <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${pluginTestResult.success ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                    {pluginTestResult.success
                      ? <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      : <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    }
                    <span>{pluginTestResult.message}</span>
                  </div>
                )}
              </div>

              {/* Webhook URL — only show if editing existing store */}
              {isEdit && storeId && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-700">{t("webhookUrl")}</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={webhookUrl}
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 bg-gray-50 text-gray-600 font-mono text-xs cursor-text select-all"
                    />
                    <button
                      type="button"
                      onClick={handleCopyWebhook}
                      className="px-3 py-2 rounded-lg text-xs font-semibold border bg-white border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap"
                    >
                      {webhookCopied ? t("copied") : t("copyUrl")}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500">{t("webhookUrlHint")}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {loading
                ? isEdit ? t("loading") : t("creating")
                : isEdit ? tCommon("save") : t("create")
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditStoreForm({ store, onClose, onSuccess }: { store: Store; onClose: () => void; onSuccess: () => void }) {
  return <StoreFormModal mode="edit" store={store} storeId={store.id} onClose={onClose} onSuccess={onSuccess} />
}

function AddStoreForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  return <StoreFormModal mode="create" onClose={onClose} onSuccess={onSuccess} />
}
