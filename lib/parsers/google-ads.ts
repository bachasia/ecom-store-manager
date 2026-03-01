import Papa from 'papaparse'
import { normalizeDateOnlyString } from '@/lib/utils/date-only'

export interface GoogleAdsRow {
  date: string
  campaignName: string
  adsetName?: string
  spend: number
  impressions?: number
  clicks?: number
}

export function parseGoogleAdsCSV(csvContent: string): GoogleAdsRow[] {
  const results: GoogleAdsRow[] = []

  const parsed = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
  })

  for (const row of parsed.data as any[]) {
    try {
      // Google Ads common column names
      const date = row['Day'] || row['Date'] || row['day']
      const campaignName = row['Campaign'] || row['Campaign name'] || row['campaign']
      const adsetName = row['Ad group'] || row['Ad group name'] || row['ad_group']
      const spend = parseFloat(row['Cost'] || row['Spend'] || row['cost'] || '0')
      const impressions = parseInt(row['Impressions'] || row['Impr.'] || row['impressions'] || '0')
      const clicks = parseInt(row['Clicks'] || row['clicks'] || '0')

      if (!date || !campaignName) {
        continue
      }

      results.push({
        date: formatDate(date),
        campaignName,
        adsetName: adsetName || undefined,
        spend,
        impressions: impressions || undefined,
        clicks: clicks || undefined,
      })
    } catch (error) {
      console.error('Error parsing row:', error)
    }
  }

  return results
}

function formatDate(dateStr: string): string {
  try {
    return normalizeDateOnlyString(dateStr)
  } catch {
    return dateStr.trim()
  }
}
