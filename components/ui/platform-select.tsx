"use client"

import { useEffect, useRef, useState } from "react"

type PlatformValue = "shopbase" | "woocommerce"

interface PlatformOption {
  value: PlatformValue
  label: string
  icon: string
}

interface PlatformSelectProps {
  value: PlatformValue
  onChange: (value: PlatformValue) => void
  options?: PlatformOption[]
}

const defaultOptions: PlatformOption[] = [
  { value: "shopbase", label: "Shopbase", icon: "/platform/shopbase-logo32.png" },
  { value: "woocommerce", label: "WooCommerce", icon: "/platform/woocommerce-logo32.png" }
]

export default function PlatformSelect({
  value,
  onChange,
  options = defaultOptions
}: PlatformSelectProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const selected = options.find((option) => option.value === value) || options[0]

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <img
            src={selected.icon}
            alt={`${selected.label} logo`}
            width={16}
            height={16}
            className="h-4 w-4 rounded-sm"
          />
          <span>{selected.label}</span>
        </span>
        <svg className={`h-4 w-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          {options.map((option) => {
            const active = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className="flex w-full items-center justify-between border-t border-gray-100 px-4 py-2.5 text-left text-sm text-gray-700 first:border-t-0 hover:bg-gray-50"
                role="option"
                aria-selected={active}
              >
                <span className="flex items-center gap-2">
                  <img
                    src={option.icon}
                    alt={`${option.label} logo`}
                    width={16}
                    height={16}
                    className="h-4 w-4 rounded-sm"
                  />
                  <span>{option.label}</span>
                </span>
                {active && (
                  <svg className="h-4 w-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
