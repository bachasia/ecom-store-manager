"use client"

import { useEffect, useRef } from "react"
import { X } from "lucide-react"
import PlatformIcon from "@/components/ui/platform-icon"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import type { StoreDrilldown } from "./DailyReportTable"

interface DailyDrilldownModalProps {
  date: string | null
  stores: StoreDrilldown[]
  loading?: boolean
  onClose: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"]

const fmtShort = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

const fmtFull = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
})

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function DailyDrilldownModal({
  date,
  stores,
  loading = false,
  onClose,
}: DailyDrilldownModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  if (!date) return null

  // Dùng storeId làm key để phân biệt đúng khi 2 store trùng tên
  const storeNameMap = new Map(stores.map((s) => [s.storeId, s.storeName]))
  const chartData = stores.map((s) => ({
    storeId: s.storeId,
    Revenue: s.revenue,
    "Net Profit": s.netProfit,
  }))

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Store Breakdown</h2>
            <p className="text-sm text-gray-500">{formatDate(date)}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {loading ? (
            <div className="space-y-3">
              <div className="h-48 animate-pulse rounded-xl bg-gray-100" />
              <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
            </div>
          ) : stores.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-12">No store data for this day.</p>
          ) : (
            <>
              {/* Mini bar chart */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-gray-700">Revenue vs Net Profit by Store</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="storeId"
                      tickFormatter={(id) => storeNameMap.get(id) ?? id}
                      style={{ fontSize: "12px" }}
                      stroke="#9ca3af"
                    />
                    <YAxis tickFormatter={(v) => fmtShort.format(v)} style={{ fontSize: "11px" }} stroke="#9ca3af" />
                    <Tooltip
                      formatter={(value: any, name: string | undefined) => [fmtFull.format(Number(value)), name ?? ""]}
                      labelFormatter={(storeId: any) => storeNameMap.get(String(storeId)) ?? String(storeId)}
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e5e7eb",
                        borderRadius: "12px",
                        padding: "10px 14px",
                        boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Bar dataKey="Revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Net Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Detail table */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-gray-700">Details</h3>
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Store</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-600">Orders</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-600">Revenue</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-600">COGS</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-600">Ads</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-600">Tx Fees</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-600">Net Profit</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-600">Margin</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-600">ROAS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {stores.map((store, idx) => (
                        <tr key={store.storeId} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">
                            <span className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                              />
                              <PlatformIcon platform={store.platform} size={14} />
                              {store.storeName}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{store.orders}</td>
                          <td className="px-3 py-2.5 text-right text-gray-900">{fmtFull.format(store.revenue)}</td>
                          <td className="px-3 py-2.5 text-right text-gray-500">{fmtFull.format(store.cogs)}</td>
                          <td className="px-3 py-2.5 text-right text-gray-500">{fmtFull.format(store.adsCost)}</td>
                          <td className="px-3 py-2.5 text-right text-gray-500">{fmtFull.format(store.transactionFees)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold">
                            <span className={store.netProfit < 0 ? "text-red-600" : "text-gray-900"}>
                              {fmtFull.format(store.netProfit)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                store.profitMargin < 0
                                  ? "bg-red-50 text-red-700"
                                  : store.profitMargin < 10
                                  ? "bg-yellow-50 text-yellow-700"
                                  : "bg-green-50 text-green-700"
                              }`}
                            >
                              {store.profitMargin.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-600">
                            {store.roas !== null ? store.roas.toFixed(2) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
