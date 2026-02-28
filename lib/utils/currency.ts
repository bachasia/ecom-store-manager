/**
 * Currency conversion utility
 * Dùng open.er-api.com (free, no key) — cùng provider với exchange-rate widget trong sidebar
 *
 * Với file Facebook Ads CSV:
 * - Cột "Amount spent (USD)" đã quy đổi về USD bởi Facebook → dùng trực tiếp
 * - Cột "Currency" cho biết currency gốc của account để lưu metadata
 * - Hàm convertToUSD() dùng khi cần convert thủ công (không có cột USD sẵn)
 */

// In-memory cache: key = "EUR_2026-01-15" → rate (1 EUR = X USD)
const rateCache = new Map<string, number>()

/**
 * Lấy tỷ giá từ currency → USD tại một ngày cụ thể.
 * open.er-api.com không hỗ trợ historical rates ở free tier,
 * nên sẽ lấy rate hiện tại (đủ dùng cho import ads).
 */
export async function getExchangeRate(fromCurrency: string): Promise<number> {
  if (fromCurrency.toUpperCase() === "USD") return 1

  const cacheKey = fromCurrency.toUpperCase()
  if (rateCache.has(cacheKey)) {
    return rateCache.get(cacheKey)!
  }

  try {
    const res = await fetch(
      `https://open.er-api.com/v6/latest/${fromCurrency.toUpperCase()}`,
      { next: { revalidate: 3600 } } // cache 1 giờ ở Next.js fetch layer
    )
    if (!res.ok) throw new Error(`Exchange rate API error: ${res.status}`)

    const data = await res.json()
    if (data.result !== "success") throw new Error("Exchange rate API returned error")

    const rate: number = data.rates?.USD
    if (!rate) throw new Error(`No USD rate found for ${fromCurrency}`)

    rateCache.set(cacheKey, rate)
    return rate
  } catch (err) {
    console.error(`[currency] Failed to get rate for ${fromCurrency}:`, err)
    // Fallback: trả về 1 (không convert) để không block import
    return 1
  }
}

/**
 * Convert một số tiền từ currency gốc sang USD.
 * @returns { usdAmount, exchangeRate }
 */
export async function convertToUSD(
  amount: number,
  fromCurrency: string
): Promise<{ usdAmount: number; exchangeRate: number }> {
  if (fromCurrency.toUpperCase() === "USD") {
    return { usdAmount: amount, exchangeRate: 1 }
  }

  const rate = await getExchangeRate(fromCurrency)
  return {
    usdAmount: parseFloat((amount * rate).toFixed(2)),
    exchangeRate: rate,
  }
}
