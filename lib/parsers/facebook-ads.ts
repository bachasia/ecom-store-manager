import Papa from 'papaparse'

export interface FacebookAdsRow {
  date: string
  campaignName: string
  adsetName?: string
  spend: number
  impressions?: number
  clicks?: number
}

export function parseFacebookAdsCSV(csvContent: string): FacebookAdsRow[] {
  const results: FacebookAdsRow[] = []

  const parsed = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
  })

  for (const row of parsed.data as any[]) {
    try {
      // Facebook Ads Manager common column names
      const date = row['Reporting starts'] || row['Date'] || row['Day']
      const campaignName = row['Campaign name'] || row['Campaign'] || row['campaign_name']
      const adsetName = row['Ad set name'] || row['Adset'] || row['adset_name']
      const spend = parseFloat(row['Amount spent (USD)'] || row['Spend'] || row['spend'] || '0')
      const impressions = parseInt(row['Impressions'] || row['impressions'] || '0')
      const clicks = parseInt(row['Link clicks'] || row['Clicks'] || row['clicks'] || '0')

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
  // Try to parse various date formats
  // Facebook usually uses: "2024-01-15" or "Jan 15, 2024"
  
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
