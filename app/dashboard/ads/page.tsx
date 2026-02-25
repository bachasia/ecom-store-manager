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

export default function AdsPage() {
  const t = useTranslations('ads')
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStore, setSelectedStore] = useState("")
  const [platform, setPlatform] = useState<"facebook" | "google">("facebook")
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)

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
      alert(t('parseError'))
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storeId: selectedStore,
          platform,
          data: parsedData,
        }),
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
      alert(t('importError'))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">{t('title')}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {t('subtitle')}
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">{t('importTitle')}</h3>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">{t('selectStore')}</label>
            <StoreSelect
              value={selectedStore}
              onChange={setSelectedStore}
              placeholder={t('selectStore')}
              options={stores.map((store) => ({
                value: store.id,
                label: store.name,
                platform: store.platform
              }))}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">{t('platform')}</label>
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

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">{t('uploadFile')}</label>
            <div className="mt-2 flex justify-center rounded-xl border-2 border-dashed border-gray-300 px-6 py-10 hover:border-indigo-400 transition-colors">
              <div className="text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <div className="mt-4 flex text-sm text-gray-600">
                  <label className="relative cursor-pointer rounded-lg bg-white font-semibold text-indigo-600 hover:text-indigo-500">
                    <span>{t('uploadButton')}</span>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="sr-only"
                    />
                  </label>
                  <p className="pl-1">{t('dragDrop')}</p>
                </div>
                <p className="text-xs text-gray-500 mt-2">{t('csvFileFrom', { platform: platform === "facebook" ? "Facebook" : "Google" })}</p>
              </div>
            </div>
            {file && (
              <p className="mt-2 text-sm text-gray-600">
                {t('selected')}: <span className="font-medium">{file.name}</span>
              </p>
            )}
          </div>

          {loading && (
            <div className="text-center py-4">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <p className="mt-2 text-sm text-gray-600">{t('parsing')}</p>
            </div>
          )}

          {parsedData.length > 0 && (
            <div className="bg-gradient-to-br from-green-50 to-green-50/50 rounded-xl border border-green-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {t('parseSuccess', { count: parsedData.length })}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {t('totalCost')}: ${parsedData.reduce((sum, row) => sum + row.spend, 0).toFixed(2)}
                  </p>
                </div>
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white shadow-sm hover:shadow-md disabled:opacity-50 transition-all"
                >
                  {importing ? t('importing') : t('import')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-gradient-to-br from-indigo-50 to-indigo-50/50 rounded-2xl border border-indigo-100 p-6">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900">{t('instructions')}</h4>
            <div className="mt-2 space-y-2 text-sm text-gray-600">
              <p>{t('facebookAds')}</p>
              <p>{t('googleAds')}</p>
              <p>{t('requiredColumns')}</p>
              <p>{t('dateFormat')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
