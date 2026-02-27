"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

interface RateState {
  rate: number | null
  change: number | null // % change vs yesterday
  loading: boolean
  error: boolean
  updatedAt: string | null
}

export default function ExchangeRate() {
  const pathname = usePathname()
  const isVi = pathname === "/vi" || pathname.startsWith("/vi/")

  const i18n = {
    label:   isVi ? "Tỷ giá USD/VND"   : "USD/VND Rate",
    rate:    isVi ? "1$ = {rate}₫"      : "1 USD = {rate} VND",
    updated: isVi ? "cập nhật {time}"   : "updated {time}",
  }

  const [state, setState] = useState<RateState>({
    rate: null,
    change: null,
    loading: true,
    error: false,
    updatedAt: null,
  })

  useEffect(() => {
    let cancelled = false

    async function fetchRate() {
      try {
        // open.er-api.com - free, no key required, updates daily
        const res = await fetch("https://open.er-api.com/v6/latest/USD", {
          next: { revalidate: 3600 },
        })
        if (!res.ok) throw new Error("fetch failed")
        const json = await res.json()

        const rate: number = json.rates?.VND
        if (!rate) throw new Error("no VND rate")

        // Fetch yesterday to get change %
        let change: number | null = null
        try {
          const now = new Date()
          const yesterday = new Date(now)
          yesterday.setDate(yesterday.getDate() - 1)
          const ymd = yesterday.toISOString().split("T")[0]
          const resY = await fetch(`https://open.er-api.com/v6/${ymd}/USD`)
          if (resY.ok) {
            const jsonY = await resY.json()
            const prevRate: number = jsonY.rates?.VND
            if (prevRate) {
              change = ((rate - prevRate) / prevRate) * 100
            }
          }
        } catch {
          // change stays null
        }

        if (!cancelled) {
          setState({
            rate,
            change,
            loading: false,
            error: false,
            updatedAt: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
          })
        }
      } catch {
        if (!cancelled) {
          setState((prev) => ({ ...prev, loading: false, error: true }))
        }
      }
    }

    fetchRate()
    // Refresh mỗi 30 phút
    const interval = setInterval(fetchRate, 30 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  if (state.loading) {
    return (
      <div className="mx-3 px-3 py-2 rounded-xl bg-gray-50 animate-pulse">
        <div className="h-3 bg-gray-200 rounded w-20 mb-1" />
        <div className="h-3.5 bg-gray-200 rounded w-28" />
      </div>
    )
  }

  if (state.error || !state.rate) return null

  const formattedRate = new Intl.NumberFormat("vi-VN").format(Math.round(state.rate))

  const ChangeIcon =
    state.change === null ? null
    : state.change > 0.01 ? TrendingUp
    : state.change < -0.01 ? TrendingDown
    : Minus

  const changeColor =
    state.change === null ? ""
    : state.change > 0.01 ? "text-green-600"
    : state.change < -0.01 ? "text-red-500"
    : "text-gray-400"

  return (
    <div className="mx-3 px-3 py-2 rounded-xl bg-indigo-50/60 border border-indigo-100">
      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">
        {i18n.label}
      </p>
      <div className="flex items-center justify-between gap-1">
        <span className="text-sm font-semibold text-gray-800">
          {i18n.rate.replace("{rate}", formattedRate)}
        </span>
        {ChangeIcon && state.change !== null && (
          <span className={`flex items-center gap-0.5 text-[11px] font-medium ${changeColor}`}>
            <ChangeIcon className="h-3 w-3" />
            {Math.abs(state.change).toFixed(2)}%
          </span>
        )}
      </div>
      {state.updatedAt && (
        <p className="text-[10px] text-gray-400 mt-0.5">
          {i18n.updated.replace("{time}", state.updatedAt)}
        </p>
      )}
    </div>
  )
}
