import { prisma } from "@/lib/prisma"

/**
 * Get the user's saved timezone from AppSetting.
 * Falls back to "UTC" if not set.
 */
export async function getUserTimezone(userId: string): Promise<string> {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: `default_timezone:${userId}` },
    })
    return setting?.value || "UTC"
  } catch {
    return "UTC"
  }
}

/**
 * Convert a YYYY-MM-DD date string + IANA timezone into UTC Date boundaries.
 *
 * Example (UTC+7, "Asia/Ho_Chi_Minh"):
 *   dateStartOf("2026-03-01", "Asia/Ho_Chi_Minh")
 *   → 2026-02-28T17:00:00.000Z  (midnight VN time = 17:00 UTC prev day)
 *
 *   dateEndOf("2026-03-01", "Asia/Ho_Chi_Minh")
 *   → 2026-03-02T17:00:00.000Z  (exclusive upper bound = start of next day)
 */
export function dateStartOf(ymd: string, timezone: string): Date {
  // "YYYY-MM-DDT00:00:00" interpreted in the given timezone via Intl
  return localMidnightToUTC(ymd, timezone)
}

export function dateEndOf(ymd: string, timezone: string): Date {
  // Start of the NEXT calendar day in the given timezone = exclusive upper bound
  const [y, m, d] = ymd.split("-").map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1)) // naive next day
  const nextYmd = next.toISOString().split("T")[0]
  return localMidnightToUTC(nextYmd, timezone)
}

/**
 * Build a Prisma date range filter { gte, lt } for a DateTime column.
 * Both startDate and endDate are inclusive calendar days in the given timezone.
 */
export function buildDateRangeFilter(
  startDate: string | null,
  endDate: string | null,
  timezone: string
): { gte?: Date; lt?: Date } | undefined {
  if (!startDate && !endDate) return undefined
  const filter: { gte?: Date; lt?: Date } = {}
  if (startDate) filter.gte = dateStartOf(startDate, timezone)
  if (endDate) filter.lt = dateEndOf(endDate, timezone)
  return filter
}

/**
 * Build a Prisma date range filter for a Date-only column (no time component).
 * Uses plain Date objects at midnight UTC — timezone doesn't shift Date-only columns.
 */
export function buildDateOnlyRangeFilter(
  startDate: string | null,
  endDate: string | null
): { gte?: Date; lte?: Date } | undefined {
  if (!startDate && !endDate) return undefined
  const filter: { gte?: Date; lte?: Date } = {}
  if (startDate) filter.gte = new Date(startDate)
  if (endDate) filter.lte = new Date(endDate)
  return filter
}

/**
 * Convert a YYYY-MM-DD string to the UTC Date that represents midnight
 * of that calendar day in the given IANA timezone.
 *
 * Strategy: use Intl.DateTimeFormat to find the UTC offset at that instant,
 * then subtract it. We iterate twice to handle DST edge cases.
 */
function localMidnightToUTC(ymd: string, timezone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number)

  // First approximation: assume the offset at noon UTC is close enough
  const noonUTC = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const offset = getUTCOffset(noonUTC, timezone) // offset in minutes

  // Midnight local = midnight UTC - offset
  const firstGuess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offset * 60 * 1000)

  // Refine: use the actual offset at the guessed time (handles DST transitions)
  const refinedOffset = getUTCOffset(firstGuess, timezone)
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - refinedOffset * 60 * 1000)
}

/**
 * Get the UTC offset in minutes for a given UTC Date in a specific timezone.
 * Positive = ahead of UTC (e.g. UTC+7 → +420).
 */
function getUTCOffset(utcDate: Date, timezone: string): number {
  try {
    // Format the date in the target timezone to get local time parts
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    const parts = fmt.formatToParts(utcDate)
    const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || "0")

    let h = get("hour")
    // Intl uses 24 for midnight in some locales — normalize
    if (h === 24) h = 0

    const localMs = Date.UTC(get("year"), get("month") - 1, get("day"), h, get("minute"), get("second"))
    return (localMs - utcDate.getTime()) / 60000
  } catch {
    return 0 // fallback: UTC
  }
}
