import Papa from 'papaparse'

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
  // Google Ads usually uses: "2024-01-15" or "Jan 15, 2024"
  
  // If already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr
  }

  // Try to parse and convert
  const date = new Date(dateStr)
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0]
  }

  return dateStr
}
