"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { useNotifier } from "@/components/ui/feedback-provider"

interface AdsAccountMapping {
  id: string
  accountName: string
  platform: string
  description: string | null
  store: { id: string; name: string; platform: string }
}

interface Props {
  storeId: string
  storeName: string
  canManage: boolean
}

export default function AdsAccountMappingPanel({ storeId, storeName, canManage }: Props) {
  const t = useTranslations("adsMapping")
  const { success, error: notifyError, confirm } = useNotifier()

  const [mappings, setMappings] = useState<AdsAccountMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const [form, setForm] = useState({ accountName: "", description: "" })
  const [formError, setFormError] = useState("")

  const fetchMappings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ads/account-mappings?storeId=${storeId}`)
      const data = await res.json()
      if (res.ok) setMappings(data.mappings)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchMappings()
  }, [fetchMappings])

  const handleAdd = async () => {
    setFormError("")
    if (!form.accountName.trim()) {
      setFormError(t("nameRequired"))
      return
    }

    setAdding(true)
    try {
      const res = await fetch("/api/ads/account-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          accountName: form.accountName.trim(),
          platform: "facebook",
          description: form.description.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        success(t("addSuccess", { name: form.accountName.trim() }))
        setMappings((prev) => [...prev, data.mapping])
        setForm({ accountName: "", description: "" })
        setShowForm(false)
      } else {
        notifyError(data.error || t("addError"))
      }
    } catch {
      notifyError(t("serverError"))
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (mapping: AdsAccountMapping) => {
    const ok = await confirm({
      title: t("deleteTitle"),
      message: t("deleteMessage", { name: mapping.accountName }),
      confirmText: t("deleteConfirm"),
      tone: "danger",
    })
    if (!ok) return

    try {
      const res = await fetch(`/api/ads/account-mappings/${mapping.id}`, { method: "DELETE" })
      if (res.ok) {
        success(t("deleteSuccess"))
        setMappings((prev) => prev.filter((m) => m.id !== mapping.id))
      } else {
        const data = await res.json()
        notifyError(data.error || t("deleteError"))
      }
    } catch {
      notifyError(t("serverError"))
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">{t("sectionTitle")}</h4>
          <p className="text-xs text-gray-500 mt-0.5">{t("sectionDesc")}</p>
        </div>
        {canManage && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t("addAccount")}
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && canManage && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
          <p className="text-xs font-semibold text-indigo-700">{t("addTitle")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {t("accountNameLabel")} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder={t("accountNamePlaceholder")}
                value={form.accountName}
                onChange={(e) => setForm((p) => ({ ...p, accountName: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  formError ? "border-red-400 bg-red-50" : "border-gray-200 bg-white"
                }`}
              />
              {formError && <p className="mt-1 text-xs text-red-500">{formError}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t("noteLabel")}</label>
              <input
                type="text"
                placeholder={t("notePlaceholder")}
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setForm({ accountName: "", description: "" })
                setFormError("")
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {adding && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {t("save")}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="py-4 text-center">
          <div className="inline-block w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : mappings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 py-6 text-center">
          <p className="text-xs text-gray-400">{t("empty")}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
          {mappings.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{m.accountName}</p>
                  {m.description && (
                    <p className="text-xs text-gray-400 truncate">{m.description}</p>
                  )}
                </div>
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => handleDelete(m)}
                  className="ml-3 flex-shrink-0 text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
                >
                  {t("deleteConfirm")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
