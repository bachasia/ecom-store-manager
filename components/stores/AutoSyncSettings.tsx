"use client"

import { useState, useEffect } from "react"
import { RefreshCw } from "lucide-react"

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

const INTERVAL_OPTIONS = [
  { value: 15,   label: "15 phút" },
  { value: 30,   label: "30 phút" },
  { value: 60,   label: "1 giờ" },
  { value: 120,  label: "2 giờ" },
  { value: 360,  label: "6 giờ" },
  { value: 720,  label: "12 giờ" },
]

function formatDateTime(iso: string | null): string {
  if (!iso) return "Chưa sync"
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function nextSyncIn(lastAt: string | null, intervalMinutes: number): string {
  if (!lastAt) return "Ngay khi bật"
  const next = new Date(lastAt).getTime() + intervalMinutes * 60 * 1000
  const diffMs = next - Date.now()
  if (diffMs <= 0) return "Ngay bây giờ"
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 60) return `${diffMin} phút nữa`
  const h = Math.floor(diffMin / 60)
  const m = diffMin % 60
  return m > 0 ? `${h}h ${m}m nữa` : `${h}h nữa`
}

export default function AutoSyncSettings({ storeId, platform }: AutoSyncSettingsProps) {
  const [settings, setSettings] = useState<AutoSyncState>({
    autoSyncEnabled: false,
    autoSyncInterval: 60,
    lastOrderAutoSyncAt: null,
    lastProductAutoSyncAt: null,
  })
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

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
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-semibold text-gray-800">Auto Sync</span>
          {saving && <span className="text-xs text-gray-400">Đang lưu...</span>}
          {saved && <span className="text-xs text-green-500">Đã lưu</span>}
        </div>

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

      {settings.autoSyncEnabled && (
        <div className="space-y-3">
          {/* Interval picker */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">Sync orders mỗi</span>
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
              <span>Orders sync lần cuối</span>
              <span className="font-medium text-gray-700">{formatDateTime(settings.lastOrderAutoSyncAt)}</span>
            </div>
            <div className="flex justify-between">
              <span>Orders sync tiếp theo</span>
              <span className="font-medium text-indigo-600">{nextSyncIn(settings.lastOrderAutoSyncAt, settings.autoSyncInterval)}</span>
            </div>
            {platform === "shopbase" && (
              <>
                <div className="flex justify-between border-t border-gray-100 pt-1.5 mt-1.5">
                  <span>Products sync lần cuối</span>
                  <span className="font-medium text-gray-700">{formatDateTime(settings.lastProductAutoSyncAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Products sync tiếp theo</span>
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
