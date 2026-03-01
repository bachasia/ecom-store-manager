"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { usePathname } from "next/navigation"
import { Check, ChevronDown, Globe } from "lucide-react"

const LOCALES = [
  { value: "en", label: "English", sub: "English (US)" },
  { value: "vi", label: "Tiếng Việt", sub: "Vietnamese" },
] as const

export default function LanguageSwitcher() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<{ bottom: number; left: number; width: number } | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const isViPath = pathname === "/vi" || pathname.startsWith("/vi/")
  const normalizedPath = pathname.replace(/^\/vi(?=\/|$)/, "") || "/"
  const currentLocale = isViPath ? "vi" : "en"
  const current = LOCALES.find((l) => l.value === currentLocale)!

  const switchLocale = (locale: "en" | "vi") => {
    if (locale === currentLocale) return setOpen(false)
    const target = locale === "en"
      ? (normalizedPath === "/" ? "/en" : `/en${normalizedPath}`)
      : (normalizedPath === "/" ? "/vi" : `/vi${normalizedPath}`)
    document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000`
    window.location.assign(target)
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  useEffect(() => {
    if (!open) return

    const updatePosition = () => {
      const rect = wrapperRef.current?.getBoundingClientRect()
      if (!rect) return

      setDropdownStyle({
        bottom: window.innerHeight - rect.top + 6,
        left: rect.left,
        width: rect.width,
      })
    }

    updatePosition()
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)

    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [open])

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <Globe className="h-4 w-4 text-gray-400 shrink-0" />
        <span className="flex-1 text-left">
          <span className="block text-[10px] text-gray-400 leading-none mb-0.5">Language</span>
          <span className="block text-sm font-medium text-gray-800 leading-none">{current.label}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && mounted && dropdownStyle && createPortal(
        <div
          className="fixed z-[100] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
          style={{
            bottom: dropdownStyle.bottom,
            left: dropdownStyle.left,
            width: dropdownStyle.width,
          }}
        >
          {LOCALES.map((loc) => (
            <button
              key={loc.value}
              type="button"
              onClick={() => switchLocale(loc.value)}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-gray-50 ${
                loc.value !== LOCALES[0].value ? "border-t border-gray-100" : ""
              }`}
            >
              <span className="flex-1 text-left">
                <span className="block text-sm font-medium text-gray-800">{loc.label}</span>
                <span className="block text-xs text-gray-400">{loc.sub}</span>
              </span>
              {currentLocale === loc.value && <Check className="h-4 w-4 text-indigo-600 shrink-0" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
