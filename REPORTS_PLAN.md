# REPORTS MODULE — KẾ HOẠCH TRIỂN KHAI

**Feature**: Section 9.2 — Báo Cáo Chi Tiết  
**Khởi tạo**: 2026-02-26  
**Cập nhật lần cuối**: 2026-02-26  
**Status tổng thể**: ✅ HOÀN THÀNH — Phase 1 ✅ Phase 2 ✅ Phase 3 ✅ Phase 4 ✅

---

## Tóm Tắt Nhanh

| Hạng mục | Chi tiết |
|----------|----------|
| Tech stack | Next.js App Router + TypeScript + Tailwind + Recharts + PostgreSQL/Prisma |
| Pattern | Client-side fetch, local useState/useEffect, custom Tailwind components |
| API reuse | `/api/pnl?groupBy=day\|store`, `/api/pnl/products` — tái sử dụng logic |
| UI reuse | `DateRangeSelect`, `StoreSelect`, `StoreComparisonChart`, `RevenueProfitComboChart` |
| Export lib | `xlsx` đã installed, chưa dùng |
| i18n | Cần thêm keys vào `messages/en.json` + `messages/vi.json` |
| Ước tính tổng | ~33–35 giờ dev |

---

## Tiến Độ Tổng Thể

```
Phase 1 — API Layer          [✅] 5/5  endpoints  ← DONE
Phase 2 — UI Components      [✅] 6/6  components ← DONE
Phase 3 — Pages & Navigation [✅] 3/3  tasks ← DONE
Phase 4 — Settings Extension [✅] 1/1  task  ← DONE
```

---

## PHASE 1 — API LAYER

### 1.1 `/api/reports/daily`
**Status**: ✅ DONE  
**File**: `app/api/reports/daily/route.ts`  
**Ước tính**: ~3h

**Params**: `storeId?`, `startDate`, `endDate`

**Response shape**:
```typescript
{
  days: [{
    date: string           // "2026-02-01"
    orders: number
    revenue: number
    cogs: number
    adsCost: number
    transactionFees: number
    grossProfit: number
    netProfit: number
    profitMargin: number
    roas: number | null
    stores: [{
      storeId, storeName
      orders, revenue, cogs, adsCost, transactionFees
      grossProfit, netProfit, profitMargin, roas
    }]
  }]
}
```

**Implementation notes**:
- Mở rộng logic `/api/pnl?groupBy=day`
- Thêm nested GROUP BY store trong mỗi ngày
- Reuse `Order` table cached P&L fields
- Lazy load drilldown: chỉ fetch stores data khi user expand row

**Checklist**:
- [x] Tạo route handler
- [x] Query daily aggregation từ Order table
- [x] Nested query per-store trong mỗi ngày (lazy via `?drilldown=true`)
- [x] Add auth guard
- [x] Validate params

---

### 1.2 `/api/reports/sku`
**Status**: ✅ DONE  
**File**: `app/api/reports/sku/route.ts`  
**Ước tính**: ~2h

**Params**: `storeId?`, `startDate`, `endDate`, `sortBy=profit|revenue|margin`, `limit=50`

**Response shape**:
```typescript
{
  profitable: SKURow[]     // netProfit > 0, sorted desc
  lossmaking: SKURow[]     // netProfit <= 0, sorted asc
  all: SKURow[]
}
// SKURow:
{
  sku, productName, storeId, storeName
  unitsSold, revenue, cogs, adsCost, transactionFees
  grossProfit, netProfit, profitMargin
}
```

**Implementation notes**:
- Tái sử dụng `/api/pnl/products` — thêm phân loại profitable/loss-making
- JOIN OrderItem → Product → Store

**Checklist**:
- [x] Tạo route handler
- [x] Query per-SKU metrics (JOIN OrderItem, Product, Store)
- [x] Phân loại profitable / lossmaking
- [x] Sorting + limit (sortBy=profit|revenue|margin|units)
- [x] Add auth guard

---

### 1.3 `/api/reports/store`
**Status**: ✅ DONE  
**File**: `app/api/reports/store/route.ts`  
**Ước tính**: ~2h

**Params**: `startDate`, `endDate`, `groupBy=total|day|month`

**Response shape**:
```typescript
{
  comparison: [{
    storeId, storeName, platform
    orders, revenue, cogs, adsCost, transactionFees
    netProfit, profitMargin, roas
  }]
  trends: [{              // khi groupBy=day|month
    date: string
    stores: { [storeId]: { revenue, netProfit, roas } }
  }]
}
```

**Implementation notes**:
- Tái sử dụng `/api/pnl?groupBy=store` cho comparison
- Thêm nested groupBy (date + store) cho trends

**Checklist**:
- [x] Tạo route handler
- [x] Query comparison (aggregate per store)
- [x] Query trends (groupBy=day|month, nested per store)
- [x] Add auth guard
- [x] Include store metadata in response (id, name, platform)

---

### 1.4 `/api/reports/alerts`
**Status**: ✅ DONE  
**File**: `app/api/reports/alerts/route.ts`  
**Ước tính**: ~3h

**Params**: `storeId?`, `startDate`, `endDate`

**Response shape**:
```typescript
{
  negativeROI: [{
    date, storeId, storeName
    revenue, adsCost, netProfit
    roi: number         // negative
  }]
  lowROAS: [{
    date, storeId, storeName
    adsCost, revenue, roas: number
    threshold: number   // lấy từ AppSetting 'roas_threshold'
  }]
  missingCOGS: [{
    productId, sku, productName, storeId, storeName
    unitsSold: number
    revenueAtRisk: number
  }]
  summary: {
    negativeROIDays: number
    lowROASDays: number
    missingCOGSCount: number
  }
}
```

**Business rules**:
- `negativeROI`: `netProfit < 0` per ngày per store
- `lowROAS`: `roas < threshold` VÀ `adsCost > 0` (không alert khi không có ads)
- `missingCOGS`: `Product.baseCost IS NULL OR baseCost = 0` VÀ product có orders trong kỳ

**Checklist**:
- [x] Tạo route handler
- [x] Query negative ROI days (daily netProfit < 0, sort worst-first)
- [x] Query low ROAS days (roas < threshold, adsCost > 0, sort lowest-first)
- [x] Query missing COGS products (có orders, baseCost = 0, sort by revenueAtRisk)
- [x] Đọc `roas_threshold` từ AppSetting (default 1.0)
- [x] Build summary counts
- [x] Add auth guard

---

## PHASE 2 — UI COMPONENTS

### 2.1 `DailyReportTable`
**Status**: ✅ DONE  
**File**: `components/reports/DailyReportTable.tsx`  
**Ước tính**: ~3h

**Features**:
- Columns: Date | Orders | Revenue | COGS | Ads Cost | Transaction Fees | Gross Profit | Net Profit | Margin%
- Row click → expand drilldown (per-store breakdown)
- Color coding: Margin < 0 = red bg, 0–10% = yellow, >10% = green
- Loading skeleton

**Checklist**:
- [ ] Table layout + columns
- [ ] Expandable row drilldown
- [ ] Color coding theo margin
- [ ] Loading state

---

### 2.2 `DailyDrilldownModal`
**Status**: ✅ DONE  
**File**: `components/reports/DailyDrilldownModal.tsx`  
**Ước tính**: ~2h

**Features**:
- Trigger khi click row date
- Breakdown per store trong ngày đó
- Mini bar chart: revenue + netProfit per store (Recharts)

**Checklist**:
- [ ] Modal layout
- [ ] Store breakdown table
- [ ] Mini bar chart

---

### 2.3 `SKUReportTable`
**Status**: ✅ DONE  
**File**: `components/reports/SKUReportTable.tsx`  
**Ước tính**: ~3h

**Features**:
- Tabs: All | Profitable | Loss-making
- Columns: SKU | Product | Store | Units Sold | Revenue | COGS | Ads Cost | Net Profit | Margin%
- Sortable columns
- Color: loss-making rows = red tint, top profitable = green tint
- Badge "Top 10" trên profitable rows

**Checklist**:
- [ ] Tabs: All / Profitable / Loss-making
- [ ] Table + sortable columns
- [ ] Row color coding
- [ ] Top 10 badge

---

### 2.4 `StoreComparisonTable`
**Status**: ✅ DONE  
**File**: `components/reports/StoreComparisonTable.tsx`  
**Ước tính**: ~2h

**Features**:
- Side-by-side comparison tất cả stores
- Columns: Store | Platform | Orders | Revenue | COGS | Ads Cost | Net Profit | Margin% | ROAS
- Sortable

**Checklist**:
- [ ] Table layout
- [ ] Platform badge/icon
- [ ] Sort

---

### 2.5 `StoreTrendChart`
**Status**: ✅ DONE  
**File**: `components/reports/StoreTrendChart.tsx`  
**Ước tính**: ~2h

**Features**:
- Multi-line Recharts LineChart, mỗi store = 1 màu
- Toggle metric: Revenue / Net Profit / ROAS
- Toggle granularity: Daily / Monthly
- Legend với store names

**Checklist**:
- [ ] LineChart với dynamic lines per store
- [ ] Metric toggle (revenue/profit/roas)
- [ ] Granularity toggle (day/month)

---

### 2.6 `AlertsPanel`
**Status**: ✅ DONE  
**File**: `components/reports/AlertsPanel.tsx`  
**Ước tính**: ~4h

**Features**:
- 3 sections: Negative ROI | Low ROAS | Missing COGS
- Badge count trên mỗi section header
- Summary stats ở đầu: "X ngày ROI âm, Y ROAS thấp, Z SKU thiếu COGS"
- Mỗi alert row có action link → Orders page / Products page
- Colors: đỏ (negative ROI), cam (low ROAS), vàng (missing COGS)

**Checklist**:
- [ ] Layout 3 sections / tabs
- [ ] Summary stats row
- [ ] Negative ROI list + link to orders
- [ ] Low ROAS list + link to ads
- [ ] Missing COGS list + link to products
- [ ] Badge counts
- [ ] Empty states

---

## PHASE 3 — PAGES & NAVIGATION

### 3.1 Reports Page Layout
**Status**: ✅ DONE
**File**: `app/dashboard/reports/page.tsx`  
**Ước tính**: ~3h

**Layout**:
```
/dashboard/reports
├── Header: "Báo Cáo Chi Tiết" + Export button
├── Shared filters: DateRangeSelect + StoreSelect
└── Tabs:
    ├── [Daily Report]
    ├── [SKU Report]
    ├── [Store Report]
    └── [Alerts] (badge: tổng số alerts)
```

**Features**:
- Tab state via `?tab=daily|sku|store|alerts` searchParam (bookmarkable)
- Export Excel button (xlsx) — export bảng đang active
- Filters apply cho tất cả tabs

**Checklist**:
- [ ] Page layout + header
- [ ] Shared filter bar (DateRangeSelect + StoreSelect)
- [ ] Tab navigation với searchParam
- [ ] Export button (xlsx)
- [ ] Render correct component per tab

---

### 3.2 DashboardNav Update
**Status**: ✅ DONE
**File**: `components/dashboard/DashboardNav.tsx`  
**Ước tính**: ~0.5h

**Changes**:
- Thêm "Reports" nav link sau "Dashboard"
- Badge trên link: tổng số active alerts

**Checklist**:
- [ ] Thêm Reports link vào nav
- [ ] Fetch alert summary count
- [ ] Badge hiển thị count

---

### 3.3 i18n Keys
**Status**: ✅ DONE
**Files**: `messages/en.json`, `messages/vi.json`  
**Ước tính**: ~0.5h

**Keys cần thêm**:
```json
{
  "reports": {
    "title": "Detailed Reports",
    "tabs": {
      "daily": "Daily Report",
      "sku": "SKU Report",
      "store": "Store Report",
      "alerts": "Alerts"
    },
    "daily": { ... },
    "sku": { ... },
    "store": { ... },
    "alerts": { ... }
  }
}
```

**Checklist**:
- [ ] en.json — tất cả keys
- [ ] vi.json — tất cả keys

---

## PHASE 4 — SETTINGS EXTENSION

### 4.1 ROAS Threshold Setting
**Status**: ⏳ PENDING  
**File**: `app/dashboard/settings/page.tsx` (edit existing)  
**Ước tính**: ~1h

**Changes**:
- Thêm section "Alert Settings" trong Settings page
- Input: "Alert khi ROAS < [X]" (default: 1.0)
- Lưu vào `AppSetting` với key `roas_threshold`
- Cần thêm API endpoint: `GET/PUT /api/settings/alerts`

**Checklist**:
- [x] API: `GET /api/settings/alerts` (đọc roas_threshold) — `app/api/settings/alerts/route.ts`
- [x] API: `PUT /api/settings/alerts` (lưu roas_threshold)
- [x] UI: Input field + Save button trong Settings page

---

## THỨ TỰ TRIỂN KHAI (RECOMMENDED)

> Ưu tiên theo value + dependency

| # | Task | File | Ước tính | Priority | Status |
|---|------|------|----------|----------|--------|
| 1 | Settings: ROAS threshold API | `app/api/settings/alerts/route.ts` | 1h | HIGH | ✅ DONE |
| 2 | Settings: ROAS threshold UI | `app/dashboard/settings/page.tsx` | 0.5h | HIGH | ✅ DONE |
| 3 | API: `/api/reports/alerts` | `app/api/reports/alerts/route.ts` | 3h | HIGH | ✅ DONE |
| 4 | API: `/api/reports/daily` | `app/api/reports/daily/route.ts` | 3h | HIGH | ✅ DONE |
| 5 | API: `/api/reports/sku` | `app/api/reports/sku/route.ts` | 2h | HIGH | ✅ DONE |
| 6 | API: `/api/reports/store` | `app/api/reports/store/route.ts` | 2h | MEDIUM | ✅ DONE |
| 7 | Component: `AlertsPanel` | `components/reports/AlertsPanel.tsx` | 4h | HIGH | ⏳ Phase 2 |
| 8 | Component: `DailyReportTable` | `components/reports/DailyReportTable.tsx` | 3h | HIGH | ⏳ Phase 2 |
| 9 | Component: `DailyDrilldownModal` | `components/reports/DailyDrilldownModal.tsx` | 2h | HIGH | ⏳ Phase 2 |
| 10 | Component: `SKUReportTable` | `components/reports/SKUReportTable.tsx` | 3h | HIGH | ⏳ Phase 2 |
| 11 | Component: `StoreComparisonTable` | `components/reports/StoreComparisonTable.tsx` | 2h | MEDIUM | ⏳ Phase 2 |
| 12 | Component: `StoreTrendChart` | `components/reports/StoreTrendChart.tsx` | 2h | MEDIUM | ⏳ Phase 2 |
| 13 | Page: Reports layout + tabs | `app/dashboard/reports/page.tsx` | 3h | HIGH | ✅ DONE |
| 14 | Nav: DashboardNav update | `components/dashboard/DashboardNav.tsx` | 0.5h | HIGH | ✅ DONE |
| 15 | i18n: en.json + vi.json | `messages/*.json` | 0.5h | HIGH | ✅ DONE |

**Tổng ước tính**: ~31.5h

---

## CONTEXT QUAN TRỌNG CHO AGENT

### APIs hiện có (tái sử dụng)
```
GET /api/pnl?groupBy=total|day|month|country|store|utmSource&storeId=&startDate=&endDate=
GET /api/pnl/products?storeId=&startDate=&endDate=&limit=
GET /api/orders?storeId=&status=&search=&startDate=&endDate=&page=&limit=
GET /api/products?storeId=&platform=&search=&page=&limit=
GET /api/stores
GET/PUT /api/settings/gateways
GET/PUT /api/settings/timezone
```

### Database models quan trọng
- **Order**: cached P&L fields: `totalCOGS`, `allocatedAdsCost`, `grossProfit`, `netProfit`, `profitMargin`
- **OrderItem**: `orderId`, `productId`, `sku`, `quantity`, `totalCost`
- **Product**: `baseCost` (COGS — null nếu chưa nhập), `sku`, `storeId`
- **AdsCost**: `date`, `storeId`, `spend`
- **AppSetting**: key-value store, dùng cho `roas_threshold`
- **Store**: `id`, `name`, `platform`

### UI Components có thể tái sử dụng
- `components/ui/date-range-select.tsx` — DateRangeSelect
- `components/ui/store-select.tsx` — StoreSelect
- `components/dashboard/StoreComparisonChart.tsx` — base cho Store Report chart
- `components/dashboard/RevenueProfitComboChart.tsx` — base cho Daily chart

### Pattern fetch data
```typescript
const [data, setData] = useState([])
const [loading, setLoading] = useState(true)

useEffect(() => { fetchData() }, [deps])

const fetchData = async () => {
  setLoading(true)
  try {
    const params = new URLSearchParams({ storeId, startDate, endDate })
    const res = await fetch(`/api/reports/daily?${params}`)
    const json = await res.json()
    if (res.ok) setData(json.days)
  } catch (e) { console.error(e) }
  finally { setLoading(false) }
}
```

### Auth pattern trong API routes
```typescript
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

const session = await getServerSession(authOptions)
if (!session?.user?.id) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
const userId = session.user.id
```

### Prisma query pattern (daily aggregation example)
```typescript
// Aggregate orders by day
const dailyData = await prisma.$queryRaw`
  SELECT
    DATE(o."orderDate") as date,
    COUNT(o.id) as orders,
    SUM(o.total) as revenue,
    SUM(o."totalCOGS") as cogs,
    SUM(o."allocatedAdsCost") as "adsCost",
    SUM(o."transactionFee") as "transactionFees",
    SUM(o."grossProfit") as "grossProfit",
    SUM(o."netProfit") as "netProfit"
  FROM "Order" o
  JOIN "Store" s ON s.id = o."storeId"
  WHERE s."userId" = ${userId}
    AND o."orderDate" >= ${startDate}
    AND o."orderDate" <= ${endDate}
  GROUP BY DATE(o."orderDate")
  ORDER BY date DESC
`
```

---

## CHANGELOG

| Ngày | Hành động | Chi tiết |
|------|-----------|----------|
| 2026-02-26 | Tạo file | Khởi tạo plan đầy đủ cho section 9.2 |
| 2026-02-26 | Phase 1 DONE ✅ | Tạo 5 API endpoints: `/api/settings/alerts`, `/api/reports/alerts`, `/api/reports/daily`, `/api/reports/sku`, `/api/reports/store` |
| 2026-02-27 | Phase 2 DONE ✅ | Tạo 6 UI components: `DailyReportTable`, `DailyDrilldownModal`, `SKUReportTable`, `StoreComparisonTable`, `StoreTrendChart`, `AlertsPanel` + i18n keys (en/vi) |
| 2026-02-27 | Phase 3+4 DONE ✅ | `app/dashboard/reports/page.tsx` (Reports page với 4 tabs + export xlsx), `DashboardNav.tsx` (Reports link + alert badge), i18n `nav.reports` + `settings.alertSettings` keys, Settings ROAS threshold UI |

---

## NOTES

- **Performance**: Daily drilldown nên lazy load — chỉ fetch store-breakdown khi user expand row
- **Missing COGS**: Check `baseCost IS NULL OR baseCost = 0`, phân biệt với "hàng free" (có thể thêm flag sau)
- **ROAS alerts**: Chỉ trigger khi `adsCost > 0` trong ngày đó — tránh false positive
- **Export**: xlsx export có thể làm client-side (build workbook từ state data) hoặc server-side
- **i18n**: Tất cả hardcoded text phải dùng `useTranslations` hook hoặc `getTranslations` (server)
