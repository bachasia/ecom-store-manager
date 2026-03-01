"use client"

import { useEffect, useState } from "react"

const DEFAULT_TIMEZONE = "UTC"

export function useUserTimezone() {
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const fetchTimezone = async () => {
      try {
        const response = await fetch("/api/settings/timezone")
        const data = await response.json()

        if (!cancelled && response.ok && typeof data.timezone === "string" && data.timezone) {
          setTimezone(data.timezone)
        }
      } catch {
        if (!cancelled) {
          setTimezone(DEFAULT_TIMEZONE)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchTimezone()

    return () => {
      cancelled = true
    }
  }, [])

  return { timezone, loading }
}
