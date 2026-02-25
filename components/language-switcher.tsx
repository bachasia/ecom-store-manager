"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { Check, ChevronDown, Globe } from "lucide-react"

export default function LanguageSwitcher() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const isViPath = pathname === "/vi" || pathname.startsWith("/vi/")
  const normalizedPath = pathname.replace(/^\/vi(?=\/|$)/, "") || "/"

  const enHref = normalizedPath === "/" ? "/en" : `/en${normalizedPath}`
  const viHref = normalizedPath === "/" ? "/vi" : `/vi${normalizedPath}`

  const switchLocale = (locale: "en" | "vi") => {
    const target = locale === "en" ? enHref : viHref
    document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000`
    window.location.assign(target)
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const currentLocale = isViPath ? "vi" : "en"
  const currentLabel = currentLocale === "en" ? "English" : "Tiếng Việt"

  const handleSelect = (locale: "en" | "vi") => {
    setOpen(false)
    if (locale !== currentLocale) {
      switchLocale(locale)
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <Globe className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-xs text-gray-500">Language</span>
            <span className="block text-sm font-semibold text-gray-900">{currentLabel}</span>
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => handleSelect("en")}
            className="flex w-full items-center justify-between px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            role="option"
            aria-selected={currentLocale === "en"}
          >
            <span className="font-medium">English</span>
            {currentLocale === "en" && <Check className="h-4 w-4 text-indigo-600" />}
          </button>
          <button
            type="button"
            onClick={() => handleSelect("vi")}
            className="flex w-full items-center justify-between border-t border-gray-100 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            role="option"
            aria-selected={currentLocale === "vi"}
          >
            <span className="font-medium">Tiếng Việt</span>
            {currentLocale === "vi" && <Check className="h-4 w-4 text-indigo-600" />}
          </button>
        </div>
      )}
    </div>
  )
}
