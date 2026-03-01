/**
 * Parser cho Facebook Ads Manager CSV dạng Account-level report.
 *
 * Cấu trúc file mẫu (reportads.csv):
 *   "Account name", Day, Currency, "Amount spent (USD)", "CTR (all)",
 *   "CPM (cost per 1,000 impressions)", Purchases, "Cost per purchase",
 *   "Purchases conversion value", "CPC (cost per link click)",
 *   "Reporting starts", "Reporting ends"
 *
 * - Dòng summary (Account name rỗng) sẽ bị bỏ qua.
 * - Nếu có cột "Amount spent (USD)" → dùng trực tiếp làm giá trị USD.
 * - Nếu không có, fallback về cột "Amount spent" với currency gốc (cần convert sau).
 */

import Papa from "papaparse"
import { normalizeDateOnlyString } from "@/lib/utils/date-only"

export interface MultiAccountAdsRow {
  accountName: string   // Tên tài khoản ads
  date: string          // YYYY-MM-DD
  currency: string      // Currency gốc của account (VD: "USD", "VND", "EUR")
  spend: number         // Luôn là USD — từ "Amount spent (USD)" hoặc đã convert
  originalSpend?: number // Chi phí theo currency gốc (nếu khác USD)
  exchangeRate?: number  // Tỷ giá đã dùng (null nếu currency = USD)

  // Extended Facebook metrics (optional — có thể thiếu tùy file)
  ctr?: number            // CTR (all) — %
  cpm?: number            // CPM (cost per 1,000 impressions)
  purchases?: number      // Số lượt mua
  costPerPurchase?: number // Cost per purchase
  purchaseValue?: number  // Purchases conversion value
  cpc?: number            // CPC (cost per link click)
}

/** Kết quả parse */
export interface ParseMultiAccountResult {
  rows: MultiAccountAdsRow[]
  accountNames: string[]      // Danh sách unique account names
  skippedRows: number         // Số dòng bị bỏ qua (summary / thiếu data)
  dateRange: { from: string; to: string } | null
}

function parseNumber(val: string | undefined | null): number | undefined {
  if (val === undefined || val === null || val.trim() === "") return undefined
  const n = parseFloat(val.replace(/,/g, ""))
  return isNaN(n) ? undefined : n
}

function parseInteger(val: string | undefined | null): number | undefined {
  if (val === undefined || val === null || val.trim() === "") return undefined
  const n = parseInt(val.replace(/,/g, ""), 10)
  return isNaN(n) ? undefined : n
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ""
  try {
    return normalizeDateOnlyString(dateStr)
  } catch {
    return dateStr.trim()
  }
}

export function parseMultiAccountFacebookAdsCSV(csvContent: string): ParseMultiAccountResult {
  const rows: MultiAccountAdsRow[] = []
  const accountSet = new Set<string>()
  let skippedRows = 0
  const dates: string[] = []

  const parsed = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
  })

  for (const raw of parsed.data as Record<string, string>[]) {
    // Lấy Account name — bỏ qua dòng summary (account name rỗng)
    const accountName = (
      raw["Account name"] ||
      raw["account_name"] ||
      raw["Account Name"] ||
      ""
    ).trim()

    if (!accountName) {
      skippedRows++
      continue
    }

    // Ngày — ưu tiên "Day" sau đó "Reporting starts"
    const rawDate =
      raw["Day"] ||
      raw["Reporting starts"] ||
      raw["Date"] ||
      raw["date"] ||
      ""

    const date = formatDate(rawDate)
    if (!date) {
      skippedRows++
      continue
    }

    // Currency gốc
    const currency = (raw["Currency"] || raw["currency"] || "USD").trim().toUpperCase()

    // Spend — ưu tiên cột "Amount spent (USD)" (Facebook đã convert)
    const spendUSDRaw = raw["Amount spent (USD)"] || raw["Amount Spent (USD)"]
    const spendLocalRaw = raw["Amount spent"] || raw["Amount Spent"] || raw["Spend"] || raw["spend"]

    let spend: number
    let originalSpend: number | undefined
    let exchangeRate: number | undefined

    if (spendUSDRaw !== undefined && spendUSDRaw.trim() !== "") {
      // Facebook đã quy đổi về USD
      spend = parseNumber(spendUSDRaw) ?? 0
      if (currency !== "USD") {
        originalSpend = parseNumber(spendLocalRaw)
        exchangeRate = originalSpend && spend ? spend / originalSpend : undefined
      }
    } else if (spendLocalRaw !== undefined && spendLocalRaw.trim() !== "") {
      // Không có cột USD — dùng local currency, sẽ cần convert ở API layer
      const local = parseNumber(spendLocalRaw) ?? 0
      spend = local // tạm thời set bằng local; API sẽ convert
      originalSpend = currency !== "USD" ? local : undefined
    } else {
      // Không có spend data — bỏ qua
      skippedRows++
      continue
    }

    // Extended metrics
    const ctr = parseNumber(raw["CTR (all)"] || raw["CTR"])
    const cpm = parseNumber(raw["CPM (cost per 1,000 impressions)"] || raw["CPM"])
    const purchases = parseInteger(raw["Purchases"] || raw["purchases"])
    const costPerPurchase = parseNumber(raw["Cost per purchase"] || raw["Cost Per Purchase"])
    const purchaseValue = parseNumber(
      raw["Purchases conversion value"] ||
      raw["Purchase conversion value"] ||
      raw["Conversion value"]
    )
    const cpc = parseNumber(raw["CPC (cost per link click)"] || raw["CPC"])

    const row: MultiAccountAdsRow = {
      accountName,
      date,
      currency,
      spend,
      ...(originalSpend !== undefined && { originalSpend }),
      ...(exchangeRate !== undefined && { exchangeRate }),
      ...(ctr !== undefined && { ctr }),
      ...(cpm !== undefined && { cpm }),
      ...(purchases !== undefined && { purchases }),
      ...(costPerPurchase !== undefined && { costPerPurchase }),
      ...(purchaseValue !== undefined && { purchaseValue }),
      ...(cpc !== undefined && { cpc }),
    }

    rows.push(row)
    accountSet.add(accountName)
    dates.push(date)
  }

  dates.sort()
  const dateRange =
    dates.length > 0
      ? { from: dates[0], to: dates[dates.length - 1] }
      : null

  return {
    rows,
    accountNames: Array.from(accountSet).sort(),
    skippedRows,
    dateRange,
  }
}
