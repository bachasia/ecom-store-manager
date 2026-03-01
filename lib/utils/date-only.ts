export function parseDateOnlyToUTC(dateStr: string): Date {
  const trimmed = dateStr.trim()
  if (!trimmed) {
    throw new Error("Date string is required")
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00.000Z`)
  }

  const utcParsed = new Date(`${trimmed} UTC`)
  if (!Number.isNaN(utcParsed.getTime())) {
    return utcParsed
  }

  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()))
  }

  throw new Error(`Invalid date string: ${dateStr}`)
}

export function normalizeDateOnlyString(dateStr: string): string {
  const date = parseDateOnlyToUTC(dateStr)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function dateOnlyToYMD(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
