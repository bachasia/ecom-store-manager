"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { parseMultiAccountFacebookAdsCSV, type MultiAccountAdsRow } from "@/lib/parsers/multi-account-ads"
import { useNotifier } from "@/components/ui/feedback-provider"
import StoreSelect from "@/components/ui/store-select"

interface Store {
  id: string
  name: string
  platform: string
  myRole: string | null
}

interface AdsAccountMapping {
  accountName: string
  storeId: string
  storeName: string
}

interface Props {
  stores: Store[]
  onImportSuccess?: () => void
}

interface ParsedPreviewRow {
  accountName: string
  date: string
  currency: string
  spend: number
  purchases?: number
  purchaseValue?: number
  mappedStoreId?: string
  mappedStoreName?: string
  storeIdOverride?: string // user chọn thủ công
}

export default function MultiAccountImport({ stores, onImportSuccess }: Props) {
  const t = useTranslations("ads")
  const { success, error: notifyError } = useNotifier()

  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)

  // Parsed data
  const [rows, setRows] = useState<MultiAccountAdsRow[]>([])
  const [accountNames, setAccountNames] = useState<string[]>([])
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(null)
  const [skippedRows, setSkippedRows] = useState(0)

  // Mappings fetched from server
  const [serverMappings, setServerMappings] = useState<AdsAccountMapping[]>([])
  const [mappingsFetched, setMappingsFetched] = useState(false)

  // Per-account storeId override (user gán thủ công trong UI)
  const [overrides, setOverrides] = useState<Record<string, string>>({})

  const canManageAds = stores.some((s) => s.myRole !== "VIEWER" && s.myRole !== null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setLoading(true)
    setRows([])
    setAccountNames([])
    setOverrides({})

    try {
      const text = await f.text()
      const result = parseMultiAccountFacebookAdsCSV(text)

      setRows(result.rows)
      setAccountNames(result.accountNames)
      setDateRange(result.dateRange)
      setSkippedRows(result.skippedRows)

      // Fetch server mappings một lần
      if (!mappingsFetched) {
        const res = await fetch("/api/ads/account-mappings")
        const data = await res.json()
        if (res.ok) {
          setServerMappings(
            data.mappings.map((m: any) => ({
              accountName: m.accountName,
              storeId: m.storeId,
              storeName: m.store.name,
            }))
          )
        }
        setMappingsFetched(true)
      }
    } catch (err) {
      console.error(err)
      notifyError(t("multiParseError"))
    } finally {
      setLoading(false)
    }
  }

  // Lấy storeId cho một accountName: override → server mapping → undefined
  const resolveStore = (accountName: string): { storeId?: string; storeName?: string } => {
    const overrideId = overrides[accountName]
    if (overrideId) {
      const store = stores.find((s) => s.id === overrideId)
      return { storeId: overrideId, storeName: store?.name }
    }
    const mapping = serverMappings.find(
      (m) => m.accountName.toLowerCase() === accountName.toLowerCase()
    )
    if (mapping) return { storeId: mapping.storeId, storeName: mapping.storeName }
    return {}
  }

  // Tổng spend theo account (aggregate rows cùng account)
  const accountSummary = accountNames.map((acc) => {
    const accRows = rows.filter((r) => r.accountName === acc)
    const totalSpend = accRows.reduce((sum, r) => sum + r.spend, 0)
    const totalPurchases = accRows.reduce((sum, r) => sum + (r.purchases || 0), 0)
    const { storeId, storeName } = resolveStore(acc)
    return { accountName: acc, rowCount: accRows.length, totalSpend, totalPurchases, storeId, storeName }
  })

  const unmappedCount = accountSummary.filter((a) => !a.storeId).length
  const totalSpend = rows.reduce((sum, r) => sum + r.spend, 0)

  const handleImport = async () => {
    if (rows.length === 0) return

    const rowsWithOverrides = rows.map((r) => {
      const { storeId } = resolveStore(r.accountName)
      return { ...r, _resolvedStoreId: storeId }
    })

    // Chuẩn bị payload — rows đã có storeId resolve thì group lại
    // API import-multi-account sẽ dùng server-side mapping nếu không có override
    // Chúng ta gửi toàn bộ rows, server tự map — nhưng với overrides ta cần gửi từng group

    // Phân nhóm rows theo override storeId
    const groups = new Map<string | "auto", MultiAccountAdsRow[]>()
    for (const r of rows) {
      const overrideId = overrides[r.accountName]
      const groupKey = overrideId || "auto"
      if (!groups.has(groupKey)) groups.set(groupKey, [])
      groups.get(groupKey)!.push(r)
    }

    setImporting(true)
    try {
      let totalImported = 0
      let totalSkipped = 0
      const allUnmapped: string[] = []

      for (const [groupKey, groupRows] of groups) {
        const payload: { rows: MultiAccountAdsRow[]; storeIdOverride?: string } = {
          rows: groupRows,
          ...(groupKey !== "auto" && { storeIdOverride: groupKey }),
        }

        const res = await fetch("/api/ads/import-multi-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        const result = await res.json()
        if (res.ok) {
          totalImported += result.imported || 0
          totalSkipped += result.skippedNoMapping || 0
          if (result.unmappedAccounts?.length) {
            allUnmapped.push(...result.unmappedAccounts)
          }
        } else {
          notifyError(result.error || t("multiParseError"))
        }
      }

      if (totalImported > 0) {
        success(
          t("multiImportSuccess", {
            count: totalImported,
            skipped: totalSkipped > 0 ? t("multiImportSkipped", { count: totalSkipped }) : "",
          })
        )
        setRows([])
        setFile(null)
        setAccountNames([])
        setDateRange(null)
        setOverrides({})
        onImportSuccess?.()
      } else if (totalSkipped > 0) {
        notifyError(
          t("multiImportNoRows", {
            count: totalSkipped,
            accounts: [...new Set(allUnmapped)].join(", "),
          })
        )
      }
    } catch (err) {
      console.error(err)
      notifyError(t("multiParseError"))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Upload zone */}
      <div>
        <label className="block text-sm font-semibold text-gray-900 mb-2">
          {t("multiUploadLabel")}
        </label>
        <div className="mt-1 flex justify-center rounded-xl border-2 border-dashed border-gray-300 px-6 py-8 hover:border-indigo-400 transition-colors">
          <div className="text-center">
            <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <div className="mt-3 flex text-sm text-gray-600 justify-center">
                <label className="relative cursor-pointer rounded-lg bg-white font-semibold text-indigo-600 hover:text-indigo-500">
                <span>{t("multiUploadBtn")}</span>
                <input type="file" accept=".csv" onChange={handleFileChange} className="sr-only" />
              </label>
              <p className="pl-1">{t("multiUploadDrag")}</p>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {t("multiUploadHint")}
            </p>
          </div>
        </div>
        {file && (
          <p className="mt-2 text-sm text-gray-600">
            File: <span className="font-medium">{file.name}</span>
          </p>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 py-3">
          <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
          <span className="text-sm text-gray-500">{t("multiReadingFile")}</span>
        </div>
      )}

      {/* Preview — only show after parse */}
      {!loading && rows.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="flex flex-wrap gap-4 rounded-xl bg-indigo-50 border border-indigo-100 p-4">
            <div>
              <p className="text-xs text-indigo-500 font-medium">{t("multiTotalRows")}</p>
              <p className="text-lg font-bold text-indigo-700">{rows.length}</p>
            </div>
            <div>
              <p className="text-xs text-indigo-500 font-medium">{t("multiAccounts")}</p>
              <p className="text-lg font-bold text-indigo-700">{accountNames.length}</p>
            </div>
            <div>
              <p className="text-xs text-indigo-500 font-medium">{t("multiTotalSpend")}</p>
              <p className="text-lg font-bold text-indigo-700">${totalSpend.toFixed(2)}</p>
            </div>
            {dateRange && (
              <div>
                <p className="text-xs text-indigo-500 font-medium">{t("multiDateRange")}</p>
                <p className="text-sm font-semibold text-indigo-700">{dateRange.from} → {dateRange.to}</p>
              </div>
            )}
            {skippedRows > 0 && (
              <div>
                <p className="text-xs text-amber-500 font-medium">{t("multiSkipped")}</p>
                <p className="text-lg font-bold text-amber-600">{skippedRows}</p>
              </div>
            )}
          </div>

          {/* Warning nếu có account chưa map */}
          {unmappedCount > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    {t("multiUnmappedWarning", { count: unmappedCount })}
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    {t.rich("multiUnmappedDesc", {
                      strong: (chunks) => <strong>{chunks}</strong>,
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Account mapping table */}
          <div className="rounded-xl border border-gray-100">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 rounded-t-xl">
              <h4 className="text-sm font-semibold text-gray-700">{t("multiMappingTitle")}</h4>
            </div>
            <div className="divide-y divide-gray-50">
              {accountSummary.map((acc) => (
                <div key={acc.accountName} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-gray-50">
                  {/* Facebook icon */}
                  <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </div>

                  {/* Account info */}
                  <div className="flex-1 min-w-[140px]">
                    <p className="text-sm font-semibold text-gray-900">{acc.accountName}</p>
                    <p className="text-xs text-gray-400">
                      {acc.rowCount} ngày · ${acc.totalSpend.toFixed(2)}
                      {acc.totalPurchases > 0 && ` · ${acc.totalPurchases} purchases`}
                    </p>
                  </div>

                  {/* Arrow */}
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>

                  {/* Store select / mapped badge */}
                  <div className="flex-1 min-w-[200px]">
                    {acc.storeName && !overrides[acc.accountName] ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          {acc.storeName}
                        </span>
                        <button
                          type="button"
                          onClick={() => setOverrides((p) => ({ ...p, [acc.accountName]: "" }))}
                          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {t("multiChange")}
                        </button>
                      </div>
                    ) : (
                      <StoreSelect
                        value={overrides[acc.accountName] || ""}
                        onChange={(val) =>
                          setOverrides((p) => ({
                            ...p,
                            [acc.accountName]: val,
                          }))
                        }
                        placeholder={t("multiStoreSelect")}
                        options={stores
                          .filter((s) => s.myRole !== "VIEWER")
                          .map((s) => ({ value: s.id, label: s.name, platform: s.platform }))}
                        className="w-full text-sm"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Import button */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {t("multiMappedCount", { mapped: accountSummary.filter((a) => a.storeId).length, total: accountNames.length })}
            </p>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || !canManageAds}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white shadow-sm hover:shadow-md disabled:opacity-50 transition-all"
            >
              {importing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t("multiImporting")}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {t("multiImportBtn", { count: rows.length })}
                </>
              )}
            </button>
          </div>
        </>
      )}

      {/* Instructions */}
      {!loading && rows.length === 0 && (
        <div className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-50/50 border border-blue-100 p-5">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            <div className="text-sm text-gray-600 space-y-1">
              <p className="font-semibold text-gray-900">{t("multiInstructionsTitle")}</p>
              <p>1. {t.rich("multiStep1", { strong: (chunks) => <strong>{chunks}</strong> })}</p>
              <p>2. {t.rich("multiStep2", { strong: (chunks) => <strong>{chunks}</strong> })}</p>
              <p>3. {t("multiStep3")}</p>
              <p>4. {t.rich("multiStep4", { strong: (chunks) => <strong>{chunks}</strong> })}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
