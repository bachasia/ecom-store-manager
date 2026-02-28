"use client"

import { useState, useEffect } from "react"
import { RefreshCw, Settings } from "lucide-react"
import { useTranslations } from "next-intl"

interface AutoSyncSettingsProps {
  storeId: string
  platform: string
}

interface AutoSyncState {
  autoSyncEnabled: boolean
  autoSyncInterval: number
  lastOrderAutoSyncAt: string | null
  lastProductAutoSyncAt: string | null
}

export default function AutoSyncSettings({ storeId, platform }: AutoSyncSettingsProps) {
  const t = useTranslations("stores.autoSync")

  const INTERVAL_OPTIONS = [
    { value: 5,    label: t("interval5m") },
    { value: 15,   label: t("interval15m") },
    { value: 30,   label: t("interval30m") },
    { value: 60,   label: t("interval1h") },
    { value: 120,  label: t("interval2h") },
    { value: 180,  label: t("interval3h") },
    { value: 360,  label: t("interval6h") },
    { value: 720,  label: t("interval12h") },
    { value: 1440, label: t("interval24h") },
  ]

  const [settings, setSettings] = useState<AutoSyncState>({
    autoSyncEnabled: false,
    autoSyncInterval: 60,
    lastOrderAutoSyncAt: null,
    lastProductAutoSyncAt: null,
  })
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    fetch(`/api/stores/${storeId}/auto-sync`)
      .then(r => r.json())
      .then(data => {
        if (data.store) setSettings(data.store)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [storeId])

  const handleToggle = async (enabled: boolean) => {
    setSettings(s => ({ ...s, autoSyncEnabled: enabled }))
    await save({ autoSyncEnabled: enabled })
  }

  const handleIntervalChange = async (interval: number) => {
    setSettings(s => ({ ...s, autoSyncInterval: interval }))
    await save({ autoSyncInterval: interval })
  }

  const save = async (patch: Partial<AutoSyncState>) => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch(`/api/stores/${storeId}/auto-sync`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (res.ok && data.store) {
        setSettings(data.store)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch (e) {
      console.error("Failed to save auto sync settings", e)
    } finally {
      setSaving(false)
    }
  }

  function formatDateTime(iso: string | null): string {
    if (!iso) return t("never")
    return new Date(iso).toLocaleString(undefined, {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    })
  }

  function nextSyncIn(lastAt: string | null, intervalMinutes: number): string {
    if (!lastAt) return t("immediately")
    const next = new Date(lastAt).getTime() + intervalMinutes * 60 * 1000
    const diffMs = next - Date.now()
    if (diffMs <= 0) return t("rightNow")
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 60) return t("inMinutes", { n: diffMin })
    const h = Math.floor(diffMin / 60)
    const m = diffMin % 60
    return m > 0 ? t("inHours", { n: h, m }) : t("inHoursOnly", { n: h })
  }

  if (loading) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-100 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-32 mb-3" />
        <div className="h-8 bg-gray-100 rounded-xl w-full" />
      </div>
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-semibold text-gray-800">{t("title")}</span>
          {saving && <span className="text-xs text-gray-400">{t("saving")}</span>}
          {saved  && <span className="text-xs text-green-500">{t("saved")}</span>}
        </div>

        <div className="flex items-center gap-2">
          {/* Settings button — expand/collapse config */}
          <button
            onClick={() => setExpanded(v => !v)}
            title="Settings"
            className={`p-1.5 rounded-lg transition-colors ${
              expanded
                ? "text-indigo-600 bg-indigo-50"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Toggle */}
          <button
            onClick={() => handleToggle(!settings.autoSyncEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              settings.autoSyncEnabled ? "bg-indigo-600" : "bg-gray-200"
            }`}
            aria-label="Toggle auto sync"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                settings.autoSyncEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Expandable settings — only shown when gear icon is clicked */}
      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Interval picker */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">{t("syncOrdersEvery")}</span>
            <select
              value={settings.autoSyncInterval}
              onChange={e => handleIntervalChange(Number(e.target.value))}
              className="flex-1 h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 appearance-none cursor-pointer"
            >
              {INTERVAL_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Timestamps */}
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 space-y-1.5 text-xs text-gray-500">
            <div className="flex justify-between">
              <span>{t("lastOrderSync")}</span>
              <span className="font-medium text-gray-700">{formatDateTime(settings.lastOrderAutoSyncAt)}</span>
            </div>
            <div className="flex justify-between">
              <span>{t("nextOrderSync")}</span>
              <span className="font-medium text-indigo-600">{nextSyncIn(settings.lastOrderAutoSyncAt, settings.autoSyncInterval)}</span>
            </div>
            {platform === "shopbase" && (
              <>
                <div className="flex justify-between border-t border-gray-100 pt-1.5 mt-1.5">
                  <span>{t("lastProductSync")}</span>
                  <span className="font-medium text-gray-700">{formatDateTime(settings.lastProductAutoSyncAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t("nextProductSync")}</span>
                  <span className="font-medium text-indigo-600">{nextSyncIn(settings.lastProductAutoSyncAt, 24 * 60)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
