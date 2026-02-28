# Kế hoạch: Tính năng Ads Account Mapping & Report

**Ngày lập:** 2026-02-28  
**Mục tiêu:** Cho phép map nhiều Ads Account Name vào một Store, import chi phí quảng cáo từ CSV (tự động convert về USD), và xem Report chi tiết chi phí Ads theo Store.

---

## 1. Phân tích hiện trạng

### Model `AdsCost` hiện tại
```prisma
model AdsCost {
  id           String   @id
  storeId      String           // liên kết trực tiếp với Store
  date         DateTime @db.Date
  platform     String           // 'facebook' | 'google' | 'manual'
  campaignName String   @default("")
  adsetName    String   @default("")
  spend        Decimal  @db.Decimal(10, 2)
  impressions  Int?
  clicks       Int?
}
```

### Luồng import hiện tại
1. User chọn Store → chọn Platform (Facebook/Google) → upload CSV
2. Parser (`lib/parsers/facebook-ads.ts`) đọc CSV → extract `date`, `campaignName`, `adsetName`, `spend`
3. API `POST /api/ads/import` nhận `{ storeId, platform, data[] }` → upsert vào `AdsCost`
4. Tự động recalculate P&L cho store sau import

### Vấn đề với file CSV mẫu (`reportads.csv`)
File CSV của Facebook Ads Manager dạng **Account-level report** với các cột:
- `Account name` — tên tài khoản ads (VD: "VNEC 10", "HT 332702")
- `Day` — ngày
- `Currency` — loại tiền (có thể khác USD)
- `Amount spent (USD)` — chi phí (đã quy đổi sang USD bởi Facebook)
- Các metrics khác: CTR, CPM, Purchases, Cost per purchase, Purchases conversion value, CPC

**Vấn đề:** 1 Store có thể chạy quảng cáo từ **nhiều tài khoản** khác nhau (multi-account). Hiện tại không có cách map `Account name` → `Store`.

---

## 2. Thiết kế giải pháp

### 2.1 Model mới: `AdsAccountMapping`

Map nhiều Ads Account Name vào một Store:

```prisma
model AdsAccountMapping {
  id          String   @id @default(cuid())
  storeId     String
  accountName String   // Tên account trong file CSV, VD: "VNEC 10", "HT 332702"
  platform    String   // 'facebook' | 'google' | 'manual'
  description String?  // Ghi chú tùy chọn
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  store       Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)

  @@unique([storeId, platform, accountName])
  @@index([storeId])
}
```

Thêm quan hệ vào `Store`:
```prisma
model Store {
  // ... existing fields
  adsAccountMappings AdsAccountMapping[]
}
```

### 2.2 Mở rộng model `AdsCost`

Thêm các trường để lưu đủ dữ liệu từ file CSV mẫu:

```prisma
model AdsCost {
  // ... existing fields
  accountName       String?  // Tên tài khoản ads (từ "Account name" trong CSV)
  currency          String   @default("USD")    // Currency gốc từ file
  originalSpend     Decimal? @db.Decimal(10, 2) // Chi phí theo currency gốc
  exchangeRate      Decimal? @db.Decimal(10, 6) // Tỷ giá convert sang USD
  
  // Metrics từ CSV
  ctr               Decimal? @db.Decimal(10, 8) // CTR (all)
  cpm               Decimal? @db.Decimal(10, 6) // CPM
  purchases         Int?                         // Số lượt mua
  costPerPurchase   Decimal? @db.Decimal(10, 6) // Cost per purchase
  purchaseValue     Decimal? @db.Decimal(10, 2) // Purchases conversion value
  cpc               Decimal? @db.Decimal(10, 8) // CPC (cost per link click)
}
```

> **Lưu ý:** `spend` vẫn là số USD đã được convert, dùng cho tính P&L. `originalSpend` + `currency` lưu giá trị gốc để audit.

### 2.3 Luồng import mới: "Multi-Account CSV Import"

```
File CSV
   │
   ▼
Parser mới: parseMultiAccountAdsCSV()
   │  - Đọc "Account name", "Day", "Currency", "Amount spent (USD)"
   │  - Nhóm rows theo Account name
   ▼
Preview bảng dữ liệu
   │  - Hiển thị các Account Names tìm thấy
   │  - Hiển thị mapping hiện tại (account → store)
   │  - Cảnh báo nếu account chưa được map
   ▼
User xác nhận mapping
   │  - Có thể tạo mapping mới ngay trong UI
   ▼
API POST /api/ads/import-multi-account
   │  - Nhận: { file data, storeId? }
   │  - Nếu storeId truyền vào: import tất cả accounts vào store đó
   │  - Nếu không: dùng AdsAccountMapping để tự động phân loại
   │  - Convert currency → USD nếu cần (via exchange rate API)
   │  - Upsert AdsCost với đủ fields
   ▼
Recalculate P&L cho các stores bị ảnh hưởng
```

### 2.4 Currency Conversion

- **Ưu tiên 1:** Lấy tỷ giá thực tế theo ngày từ `open.er-api.com` (API đang dùng trong project)
- **Ưu tiên 2:** Nếu file đã có cột `Amount spent (USD)` → dùng trực tiếp (như file mẫu hiện tại)
- **Fallback:** Nếu không có tỷ giá theo ngày → dùng tỷ giá hiện tại tại thời điểm import

```typescript
// lib/utils/currency.ts (mới)
async function convertToUSD(amount: number, currency: string, date: string): Promise<{
  usdAmount: number
  exchangeRate: number
}>
```

---

## 3. Danh sách file cần thêm/sửa

### 3.1 Database (Prisma)
| File | Thay đổi |
|------|----------|
| `prisma/schema.prisma` | Thêm model `AdsAccountMapping`, mở rộng `AdsCost` |
| `prisma/migrations/` | Migration tự động |

### 3.2 Backend — API Routes (mới)
| File | Mô tả |
|------|-------|
| `app/api/ads/account-mappings/route.ts` | GET list + POST create mapping |
| `app/api/ads/account-mappings/[id]/route.ts` | PUT update + DELETE mapping |
| `app/api/ads/import-multi-account/route.ts` | POST import từ multi-account CSV |
| `app/api/ads/report/route.ts` | GET report chi phí ads theo store, date range |

### 3.3 Backend — Thư viện (mới/sửa)
| File | Mô tả |
|------|-------|
| `lib/parsers/multi-account-ads.ts` | Parser cho file CSV dạng Account-level |
| `lib/utils/currency.ts` | Helper convert currency → USD |

### 3.4 Frontend — Pages
| File | Thay đổi |
|------|----------|
| `app/dashboard/ads/page.tsx` | Thêm tab "Multi-Account Import" + tab "Ads Report" |
| `app/dashboard/stores/page.tsx` | Thêm UI manage Ads Account Mappings cho mỗi store |

### 3.5 Frontend — Components (mới)
| File | Mô tả |
|------|-------|
| `components/ads/AdsAccountMappingPanel.tsx` | UI quản lý mapping (trong trang Stores) |
| `components/ads/MultiAccountImport.tsx` | Tab import multi-account với preview |
| `components/ads/AdsReport.tsx` | Report tab: bảng + chart chi phí ads |
| `components/ads/AdsSpendChart.tsx` | Recharts line/bar chart chi phí theo ngày |

### 3.6 i18n
| File | Thay đổi |
|------|----------|
| `messages/en.json` | Thêm namespace `adsMapping`, mở rộng `ads` |
| `messages/vi.json` | Tương tự |

---

## 4. Chi tiết từng bước triển khai

### Bước 1: Prisma Schema & Migration
1. Thêm model `AdsAccountMapping` vào `schema.prisma`
2. Mở rộng `AdsCost` (thêm `accountName`, `currency`, `originalSpend`, `exchangeRate`, và các metrics)
3. Thêm relation `adsAccountMappings` vào `Store`
4. Chạy `npx prisma migrate dev --name add_ads_account_mapping`
5. Chạy `npx prisma generate`

### Bước 2: Currency Utility
- Tạo `lib/utils/currency.ts`
- Hàm `convertToUSD(amount, fromCurrency, date)`:
  - Gọi `https://open.er-api.com/v6/latest/{fromCurrency}` → lấy rate sang USD
  - Cache theo ngày để tránh gọi API nhiều lần
  - Nếu `fromCurrency === 'USD'` → trả về nguyên giá trị, rate = 1

### Bước 3: Parser Multi-Account CSV
- Tạo `lib/parsers/multi-account-ads.ts`
- Export `parseMultiAccountAdsCSV(csvContent: string)`:
  ```typescript
  interface MultiAccountAdsRow {
    accountName: string
    date: string         // YYYY-MM-DD
    currency: string     // Original currency
    spend: number        // Amount in USD (from "Amount spent (USD)" column)
    originalSpend?: number
    ctr?: number
    cpm?: number
    purchases?: number
    costPerPurchase?: number
    purchaseValue?: number
    cpc?: number
  }
  ```
- Logic: đọc columns theo tên, bỏ qua dòng summary (dòng có `Account name` rỗng)
- Nếu `Currency !== 'USD'` và không có `Amount spent (USD)` → cần convert

### Bước 4: API Routes

#### `GET /api/ads/account-mappings?storeId=xxx`
- Trả về list mapping của store
- Permission: `view_dashboard`

#### `POST /api/ads/account-mappings`
- Body: `{ storeId, accountName, platform, description? }`
- Permission: `manage_ads`
- Validate unique constraint

#### `DELETE /api/ads/account-mappings/[id]`
- Permission: `manage_ads`

#### `POST /api/ads/import-multi-account`
- Body: `{ data: MultiAccountAdsRow[], storeId?: string }`
- Logic:
  1. Lấy tất cả `AdsAccountMapping` của user
  2. Với mỗi row: tìm mapping theo `accountName + platform` → ra `storeId`
  3. Nếu `storeId` override truyền vào → dùng luôn (all accounts → 1 store)
  4. Convert currency nếu cần
  5. Upsert `AdsCost` với full fields
  6. Sau import: recalculate P&L cho các stores bị ảnh hưởng

#### `GET /api/ads/report`
- Query params: `storeId`, `from`, `to`, `groupBy` (day | account | platform)
- Trả về chi phí ads tổng hợp:
  ```typescript
  interface AdsReportRow {
    date?: string
    accountName?: string
    platform?: string
    spend: number
    purchases?: number
    purchaseValue?: number
    roas?: number        // purchaseValue / spend
    ctr?: number
    cpm?: number
    cpc?: number
  }
  ```

### Bước 5: Frontend Components

#### `AdsAccountMappingPanel.tsx`
- Hiển thị trong trang Store Management (thêm tab hoặc accordion)
- Bảng list mappings: Account Name | Platform | Actions
- Form thêm mapping mới: text input + platform select + submit
- Confirm delete

#### `MultiAccountImport.tsx`
- Upload file CSV
- Auto-detect format (multi-account vs single-account)
- Preview table: Account Name | Ngày | Currency | Spend (USD) | Mapped Store | Status
- Hiển thị warning: "X accounts chưa được map"
- Link nhanh đến trang Stores để tạo mapping
- Nút Import

#### `AdsReport.tsx`
- Date range picker
- Store filter (dropdown)
- Group by: Ngày | Account | Platform
- Bảng với columns: Date/Account/Platform | Spend | Purchases | Revenue | ROAS | CTR | CPM | CPC
- Summary cards: Total Spend, Total Purchases, Total Revenue from Ads, Average ROAS
- Chart: `AdsSpendChart` — Line chart spend theo ngày, grouped by account/platform

#### Tab "Ads Report" trong `/dashboard/ads`
- Thêm tab thứ 3 vào Ads page: "Import" | "Manual" | "Report"
- Report tab embed `AdsReport` component

### Bước 6: Tích hợp Stores Page
- Trong `app/dashboard/stores/page.tsx`: thêm section "Ads Accounts" trong store detail/edit modal
- Hoặc thêm sub-tab trong Store details

### Bước 7: i18n
- Thêm keys vào `en.json` và `vi.json`

---

## 5. Wireframe luồng người dùng

```
[Trang Stores]
  └── Store Card → "Ads Accounts" button
        └── Panel: Danh sách account mappings
              [+ Add Account] → Form: Account Name + Platform
              
[Trang Ads]
  ├── Tab: Import (existing - single account)
  ├── Tab: Multi Import (mới)
  │     ├── Upload CSV
  │     ├── Preview: accounts detected, mapping status
  │     ├── Warning nếu có account chưa map
  │     └── Import button
  ├── Tab: Manual (existing)
  └── Tab: Report (mới)
        ├── Filters: Store, Date Range, Group By
        ├── KPI Cards: Total Spend | Purchases | Revenue | ROAS
        ├── Chart: Spend over time
        └── Table: Chi tiết theo ngày/account/platform
```

---

## 6. Thứ tự triển khai (Implementation Order)

1. [x] Lập kế hoạch (file này)
2. [ ] **Schema & Migration** — Prisma model mới
3. [ ] **Currency Utility** — `lib/utils/currency.ts`
4. [ ] **Parser** — `lib/parsers/multi-account-ads.ts`
5. [ ] **API: Account Mappings** — CRUD endpoints
6. [ ] **API: Multi Import** — import route mới
7. [ ] **API: Ads Report** — report endpoint
8. [ ] **Component: AdsAccountMappingPanel** — quản lý mapping
9. [ ] **Component: MultiAccountImport** — import UI
10. [ ] **Component: AdsReport + AdsSpendChart** — report UI
11. [ ] **Tích hợp vào Stores Page** — thêm mapping panel
12. [ ] **Tích hợp vào Ads Page** — thêm 2 tab mới
13. [ ] **i18n** — en.json + vi.json
14. [ ] **Test end-to-end**

---

## 7. Ghi chú kỹ thuật

- **Unique constraint trên AdsCost** hiện là `(storeId, date, platform, campaignName, adsetName)`. Khi thêm `accountName`, cần xem xét có đưa vào constraint không. Đề xuất: thêm vào để tránh duplicate khi import nhiều lần.
- **Exchange rate caching**: Dùng `AppSetting` table hoặc in-memory cache (key = `${currency}_${date}`) để tránh gọi API nhiều lần.
- **File CSV mẫu** có dòng summary (dòng 2 trong file, không có Account name) → parser phải skip dòng này.
- **Backward compatibility**: Tất cả fields mới trong `AdsCost` là optional (`?`) → không break existing data.
- **RBAC**: Manage mappings = `manage_ads` permission; View report = `view_dashboard`.
