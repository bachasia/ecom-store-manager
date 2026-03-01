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

export function toYMDInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  const year = parts.find((part) => part.type === "year")?.value ?? "1970"
  const month = parts.find((part) => part.type === "month")?.value ?? "01"
  const day = parts.find((part) => part.type === "day")?.value ?? "01"

  return `${year}-${month}-${day}`
}

function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return toYMD(date)
}

export function getDaySpan(startDate: string, endDate: string): number {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number)
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number)

  const start = Date.UTC(startYear, startMonth - 1, startDay)
  const end = Date.UTC(endYear, endMonth - 1, endDay)

  return Math.max(1, Math.floor((end - start) / 86400000) + 1)
}

export function getPreviousDateRange(range: DateRange): DateRange {
  if (!range.startDate || !range.endDate) {
    return range
  }

  const span = getDaySpan(range.startDate, range.endDate)
  const previousEnd = addDays(range.startDate, -1)
  const previousStart = addDays(previousEnd, -(span - 1))

  return {
    startDate: previousStart,
    endDate: previousEnd,
  }
}

export function getPresetRangeInTimezone(
  preset: Exclude<DatePreset, "custom">,
  timezone: string,
  now: Date = new Date()
): DateRange {
  const today = toYMDInTimezone(now, timezone)

  if (preset === "today") {
    return { startDate: today, endDate: today }
  }

  if (preset === "yesterday") {
    const yesterday = addDays(today, -1)
    return { startDate: yesterday, endDate: yesterday }
  }

  if (preset === "mtd") {
    return {
      startDate: `${today.slice(0, 8)}01`,
      endDate: today,
    }
  }

  if (preset === "last7") {
    return { startDate: addDays(today, -6), endDate: today }
  }

  if (preset === "last30") {
    return { startDate: addDays(today, -29), endDate: today }
  }

  if (preset === "lastMonth") {
    const [year, month] = today.split("-").map(Number)
    const start = new Date(Date.UTC(year, month - 2, 1))
    const end = new Date(Date.UTC(year, month - 1, 0))
    return {
      startDate: toYMD(start),
      endDate: toYMD(end),
    }
  }

  if (preset === "lastYear") {
    const year = Number(today.slice(0, 4)) - 1
    return {
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
    }
  }

  return { startDate: "", endDate: today }
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

  if (preset === "lastYear") {
    return {
      startDate: toYMD(new Date(now.getFullYear() - 1, 0, 1)),
      endDate: toYMD(new Date(now.getFullYear() - 1, 11, 31)),
    }
  }

  // allTime — không giới hạn startDate, endDate là hôm nay
  return { startDate: "", endDate: toYMD(now) }
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
