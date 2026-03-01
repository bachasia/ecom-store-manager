"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown } from "lucide-react"

interface StoreOption {
  value: string
  label: string
  platform?: string
}

interface StoreSelectProps {
  value: string
  onChange: (value: string) => void
  options: StoreOption[]
  placeholder: string
  className?: string
}

function getPlatformIcon(platform?: string): string | null {
  if (platform === "shopbase") return "/platform/shopbase-logo32.png"
  if (platform === "woocommerce") return "/platform/woocommerce-logo32.png"
  return null
}

export default function StoreSelect({
  value,
  onChange,
  options,
  placeholder,
  className = ""
}: StoreSelectProps) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: number } | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return

    const updatePosition = () => {
      const rect = wrapperRef.current?.getBoundingClientRect()
      if (!rect) return

      setDropdownStyle({
        top: rect.bottom + 8,
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const selected = options.find((option) => option.value === value)

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full h-[42px] items-center justify-between rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected ? (
            <>
              {getPlatformIcon(selected.platform) ? (
                <img
                  src={getPlatformIcon(selected.platform) || ""}
                  alt={`${selected.platform} logo`}
                  className="h-4 w-4 rounded-sm"
                  width={16}
                  height={16}
                />
              ) : (
                <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
              )}
              <span className="truncate">{selected.label}</span>
            </>
          ) : (
            <span className="truncate text-gray-500">{placeholder}</span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && mounted && dropdownStyle && createPortal(
        <div
          className="fixed z-[100] max-h-64 overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg"
          style={{
            top: dropdownStyle.top,
            left: dropdownStyle.left,
            width: dropdownStyle.width,
          }}
        >
          <button
            type="button"
            onClick={() => {
              onChange("")
              setOpen(false)
            }}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            <span>{placeholder}</span>
            {!value && <Check className="h-4 w-4 text-indigo-600" />}
          </button>
          {options.map((option) => {
            const icon = getPlatformIcon(option.platform)
            const active = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className="flex w-full items-center justify-between border-t border-gray-100 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {icon ? (
                    <img
                      src={icon}
                      alt={`${option.platform} logo`}
                      className="h-4 w-4 rounded-sm"
                      width={16}
                      height={16}
                    />
                  ) : (
                    <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
                  )}
                  <span className="truncate">{option.label}</span>
                </span>
                {active && <Check className="h-4 w-4 text-indigo-600" />}
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}
