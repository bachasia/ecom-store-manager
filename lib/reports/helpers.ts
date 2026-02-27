import type { DatePreset } from "@/components/ui/date-range-select"

export interface DateRange {
  startDate: string
  endDate: string
}

export function toYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function getPresetRange(
  preset: Exclude<DatePreset, "custom">,
  now: Date = new Date()
): DateRange {
  if (preset === "today") {
    const today = toYMD(now)
    return { startDate: today, endDate: today }
  }

  if (preset === "yesterday") {
    const d = new Date(now)
    d.setDate(d.getDate() - 1)
    const y = toYMD(d)
    return { startDate: y, endDate: y }
  }

  if (preset === "mtd") {
    return {
      startDate: toYMD(new Date(now.getFullYear(), now.getMonth(), 1)),
      endDate: toYMD(now),
    }
  }

  if (preset === "last7") {
    const start = new Date(now)
    start.setDate(start.getDate() - 6)
    return { startDate: toYMD(start), endDate: toYMD(now) }
  }

  if (preset === "last30") {
    const start = new Date(now)
    start.setDate(start.getDate() - 29)
    return { startDate: toYMD(start), endDate: toYMD(now) }
  }

  if (preset === "lastMonth") {
    return {
      startDate: toYMD(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      endDate: toYMD(new Date(now.getFullYear(), now.getMonth(), 0)),
    }
  }

  return {
    startDate: toYMD(new Date(now.getFullYear() - 1, 0, 1)),
    endDate: toYMD(new Date(now.getFullYear() - 1, 11, 31)),
  }
}

export interface AlertSummary {
  negativeROIDays?: number
  lowROASDays?: number
  missingCOGSCount?: number
}

export function getAlertCount(summary?: AlertSummary | null): number {
  if (!summary) return 0
  return (
    (summary.negativeROIDays || 0) +
    (summary.lowROASDays || 0) +
    (summary.missingCOGSCount || 0)
  )
}

export function getCurrentMonthToDateRange(now: Date = new Date()): DateRange {
  const y = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return {
    startDate: `${y}-${month}-01`,
    endDate: `${y}-${month}-${day}`,
  }
}
