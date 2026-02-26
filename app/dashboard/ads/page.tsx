"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { parseFacebookAdsCSV } from "@/lib/parsers/facebook-ads"
import { parseGoogleAdsCSV } from "@/lib/parsers/google-ads"
import StoreSelect from "@/components/ui/store-select"

interface Store {
  id: string
  name: string
  platform: string
}

interface ManualRow {
  id: string
  date: string
  campaignName: string
  adsetName: string
  spend: number
  impressions: number | ""
  clicks: number | ""
}

interface ManualFormState {
  date: string
  campaignName: string
  adsetName: string
  spend: string
  impressions: string
  clicks: string
}

const defaultManualForm: ManualFormState = {
  date: new Date().toISOString().split("T")[0],
  campaignName: "",
  adsetName: "",
  spend: "",
  impressions: "",
  clicks: "",
}

export default function AdsPage() {
  const t = useTranslations("ads")

  // shared
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState("")
  const [activeTab, setActiveTab] = useState<"import" | "manual">("import")

  // import tab state
  const [platform, setPlatform] = useState<"facebook" | "google">("facebook")
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)

  // manual tab state
  const [manualPlatform, setManualPlatform] = useState<"facebook" | "google" | "manual">("manual")
  const [manualForm, setManualForm] = useState<ManualFormState>(defaultManualForm)
  const [manualRows, setManualRows] = useState<ManualRow[]>([])
  const [manualFormErrors, setManualFormErrors] = useState<{ date?: string; spend?: string; store?: string }>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchStores()
  }, [])

  const fetchStores = async () => {
    try {
      const response = await fetch("/api/stores")
      const data = await response.json()
      if (response.ok) {
        setStores(data.stores)
        if (data.stores.length > 0) {
          setSelectedStore(data.stores[0].id)
        }
      }
    } catch (error) {
      console.error("Error fetching stores:", error)
    }
  }

  // ── Import tab handlers ──────────────────────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setLoading(true)

    try {
      const text = await selectedFile.text()

      let parsed: any[] = []
      if (platform === "facebook") {
        parsed = parseFacebookAdsCSV(text)
      } else {
        parsed = parseGoogleAdsCSV(text)
      }

      setParsedData(parsed)
    } catch (error) {
      console.error("Error parsing file:", error)
      alert(t("parseError"))
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    if (!selectedStore || parsedData.length === 0) return

    setImporting(true)

    try {
      const response = await fetch("/api/ads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: selectedStore, platform, data: parsedData }),
      })

      const result = await response.json()

      if (response.ok) {
        alert(`✅ ${result.message}`)
        setParsedData([])
        setFile(null)
      } else {
        alert(`❌ ${result.error}`)
      }
    } catch (error) {
      console.error("Error importing:", error)
      alert(t("importError"))
    } finally {
      setImporting(false)
    }
  }

  // ── Manual tab handlers ──────────────────────────────────────────────────

  const validateManualForm = (): boolean => {
    const errors: { date?: string; spend?: string; store?: string } = {}

    if (!selectedStore) errors.store = t("manualStoreRequired")
    if (!manualForm.date) errors.date = t("manualDateRequired")
    if (!manualForm.spend || isNaN(parseFloat(manualForm.spend)) || parseFloat(manualForm.spend) < 0) {
      errors.spend = t("manualSpendRequired")
    }

    setManualFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleAddRow = () => {
    if (!validateManualForm()) return

    const newRow: ManualRow = {
      id: crypto.randomUUID(),
      date: manualForm.date,
      campaignName: manualForm.campaignName,
      adsetName: manualForm.adsetName,
      spend: parseFloat(manualForm.spend),
      impressions: manualForm.impressions !== "" ? parseInt(manualForm.impressions) : "",
      clicks: manualForm.clicks !== "" ? parseInt(manualForm.clicks) : "",
    }

    setManualRows((prev) => [...prev, newRow])
    // reset only the fields that vary per row; keep date and platform
    setManualForm((prev) => ({
      ...prev,
      campaignName: "",
      adsetName: "",
      spend: "",
      impressions: "",
      clicks: "",
    }))
    setManualFormErrors({})
  }

  const handleRemoveRow = (id: string) => {
    setManualRows((prev) => prev.filter((r) => r.id !== id))
  }

  const handleSaveAll = async () => {
    if (!selectedStore) {
      setManualFormErrors({ store: t("manualStoreRequired") })
      return
    }
    if (manualRows.length === 0) return

    setSaving(true)

    try {
      const data = manualRows.map((row) => ({
        date: row.date,
        campaignName: row.campaignName || undefined,
        adsetName: row.adsetName || undefined,
        spend: row.spend,
        impressions: row.impressions !== "" ? row.impressions : undefined,
        clicks: row.clicks !== "" ? row.clicks : undefined,
      }))

      const response = await fetch("/api/ads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: selectedStore, platform: manualPlatform, data }),
      })

      const result = await response.json()

      if (response.ok) {
        alert(t("manualSaveSuccess", { count: manualRows.length }))
        setManualRows([])
      } else {
        alert(`❌ ${result.error}`)
      }
    } catch (error) {
      console.error("Error saving manual rows:", error)
      alert(t("manualSaveError"))
    } finally {
      setSaving(false)
    }
  }

  const manualTotalSpend = manualRows.reduce((sum, r) => sum + r.spend, 0)

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">{t("title")}</h2>
        <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("import")}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "import"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {t("tabImport")}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("manual")}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "manual"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {t("tabManual")}
        </button>
      </div>

      {/* ── IMPORT TAB ── */}
      {activeTab === "import" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">{t("importTitle")}</h3>

          <div className="space-y-5">
            {/* Store */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">{t("selectStore")}</label>
              <StoreSelect
                value={selectedStore}
                onChange={setSelectedStore}
                placeholder={t("selectStore")}
                options={stores.map((store) => ({
                  value: store.id,
                  label: store.name,
                  platform: store.platform,
                }))}
                className="w-full"
              />
            </div>

            {/* Platform */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">{t("platform")}</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPlatform("facebook")}
                  className={`px-4 py-3 rounded-xl border-2 font-medium transition-all ${
                    platform === "facebook"
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                  }`}
                >
                  Facebook Ads
                </button>
                <button
                  type="button"
                  onClick={() => setPlatform("google")}
                  className={`px-4 py-3 rounded-xl border-2 font-medium transition-all ${
                    platform === "google"
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                  }`}
                >
                  Google Ads
                </button>
              </div>
            </div>

            {/* File upload */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">{t("uploadFile")}</label>
              <div className="mt-2 flex justify-center rounded-xl border-2 border-dashed border-gray-300 px-6 py-10 hover:border-indigo-400 transition-colors">
                <div className="text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <div className="mt-4 flex text-sm text-gray-600">
                    <label className="relative cursor-pointer rounded-lg bg-white font-semibold text-indigo-600 hover:text-indigo-500">
                      <span>{t("uploadButton")}</span>
                      <input type="file" accept=".csv" onChange={handleFileChange} className="sr-only" />
                    </label>
                    <p className="pl-1">{t("dragDrop")}</p>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {t("csvFileFrom", { platform: platform === "facebook" ? "Facebook" : "Google" })}
                  </p>
                </div>
              </div>
              {file && (
                <p className="mt-2 text-sm text-gray-600">
                  {t("selected")}: <span className="font-medium">{file.name}</span>
                </p>
              )}
            </div>

            {loading && (
              <div className="text-center py-4">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <p className="mt-2 text-sm text-gray-600">{t("parsing")}</p>
              </div>
            )}

            {parsedData.length > 0 && (
              <div className="bg-gradient-to-br from-green-50 to-green-50/50 rounded-xl border border-green-100 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {t("parseSuccess", { count: parsedData.length })}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      {t("totalCost")}: ${parsedData.reduce((sum, row) => sum + row.spend, 0).toFixed(2)}
                    </p>
                  </div>
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white shadow-sm hover:shadow-md disabled:opacity-50 transition-all"
                  >
                    {importing ? t("importing") : t("import")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MANUAL TAB ── */}
      {activeTab === "manual" && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">{t("manualTitle")}</h3>

            <div className="space-y-5">
              {/* Store */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">{t("selectStore")}</label>
                <StoreSelect
                  value={selectedStore}
                  onChange={setSelectedStore}
                  placeholder={t("selectStore")}
                  options={stores.map((store) => ({
                    value: store.id,
                    label: store.name,
                    platform: store.platform,
                  }))}
                  className="w-full"
                />
                {manualFormErrors.store && (
                  <p className="mt-1 text-xs text-red-500">{manualFormErrors.store}</p>
                )}
              </div>

              {/* Platform */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">{t("platform")}</label>
                <div className="grid grid-cols-3 gap-3">
                  {(["manual", "facebook", "google"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setManualPlatform(p)}
                      className={`px-4 py-3 rounded-xl border-2 font-medium transition-all capitalize ${
                        manualPlatform === p
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {p === "manual" ? "Manual" : p === "facebook" ? "Facebook Ads" : "Google Ads"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Form grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Date */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1.5">
                    {t("manualDate")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={manualForm.date}
                    onChange={(e) => setManualForm((prev) => ({ ...prev, date: e.target.value }))}
                    className={`block w-full rounded-xl border px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition ${
                      manualFormErrors.date ? "border-red-400 bg-red-50" : "border-gray-200 bg-white"
                    }`}
                  />
                  {manualFormErrors.date && (
                    <p className="mt-1 text-xs text-red-500">{manualFormErrors.date}</p>
                  )}
                </div>

                {/* Spend */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1.5">
                    {t("manualSpend")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={manualForm.spend}
                    onChange={(e) => setManualForm((prev) => ({ ...prev, spend: e.target.value }))}
                    className={`block w-full rounded-xl border px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition ${
                      manualFormErrors.spend ? "border-red-400 bg-red-50" : "border-gray-200 bg-white"
                    }`}
                  />
                  {manualFormErrors.spend && (
                    <p className="mt-1 text-xs text-red-500">{manualFormErrors.spend}</p>
                  )}
                </div>

                {/* Campaign Name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1.5">
                    {t("manualCampaign")}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Summer Sale 2025"
                    value={manualForm.campaignName}
                    onChange={(e) => setManualForm((prev) => ({ ...prev, campaignName: e.target.value }))}
                    className="block w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                </div>

                {/* Adset */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1.5">
                    {t("manualAdset")}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Retargeting - 18-35"
                    value={manualForm.adsetName}
                    onChange={(e) => setManualForm((prev) => ({ ...prev, adsetName: e.target.value }))}
                    className="block w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                </div>

                {/* Impressions */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1.5">
                    {t("manualImpressions")}
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={manualForm.impressions}
                    onChange={(e) => setManualForm((prev) => ({ ...prev, impressions: e.target.value }))}
                    className="block w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                </div>

                {/* Clicks */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1.5">
                    {t("manualClicks")}
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={manualForm.clicks}
                    onChange={(e) => setManualForm((prev) => ({ ...prev, clicks: e.target.value }))}
                    className="block w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                </div>
              </div>

              {/* Add Row button */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {t("manualAddRow")}
                </button>
              </div>
            </div>
          </div>

          {/* Preview table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">
                  {manualRows.length > 0
                    ? t("manualRowsCount", { count: manualRows.length })
                    : t("manualNoRows")}
                </h4>
                {manualRows.length > 0 && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t("manualTotalSpend", { total: manualTotalSpend.toFixed(2) })}
                  </p>
                )}
              </div>
              {manualRows.length > 0 && (
                <button
                  type="button"
                  onClick={handleSaveAll}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-green-600 to-green-500 text-sm font-semibold text-white shadow-sm hover:shadow-md disabled:opacity-50 transition-all"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {t("manualSaving")}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {t("manualSaveAll")}
                    </>
                  )}
                </button>
              )}
            </div>

            {manualRows.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-gray-400">{t("manualNoRows")}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50">
                    <tr>
                      {[
                        t("manualDate"),
                        t("manualCampaign"),
                        t("manualAdset"),
                        t("manualSpend"),
                        t("manualImpressions"),
                        t("manualClicks"),
                        "",
                      ].map((col, i) => (
                        <th
                          key={i}
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {manualRows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{row.date}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 max-w-[160px] truncate">
                          {row.campaignName || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 max-w-[140px] truncate">
                          {row.adsetName || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 whitespace-nowrap">
                          ${row.spend.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {row.impressions !== "" ? row.impressions.toLocaleString() : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {row.clicks !== "" ? row.clicks.toLocaleString() : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(row.id)}
                            className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
                          >
                            {t("manualRemove")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Instructions (only shown on import tab) */}
      {activeTab === "import" && (
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-50/50 rounded-2xl border border-indigo-100 p-6">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900">{t("instructions")}</h4>
              <div className="mt-2 space-y-2 text-sm text-gray-600">
                <p>{t("facebookAds")}</p>
                <p>{t("googleAds")}</p>
                <p>{t("requiredColumns")}</p>
                <p>{t("dateFormat")}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
