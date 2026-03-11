# PLAN: Refund Feature & GMV / Net Revenue Split

**Ngày:** 2026-03-10  
**Trạng thái:** Draft — chờ review trước khi triển khai

---

## 1. Bối Cảnh & Động Lực

### Vấn đề hiện tại
- KPI card **"Total Revenue"** đang hiển thị `total - refundAmount` (Net Revenue) nhưng lại đặt tên là "Total Revenue" → gây nhầm lẫn khi team so với GMV.
- Hệ thống chỉ có **1 chiều refund**: `refundAmount` (tiền hoàn lại cho khách), chưa track **vendor refund** (nhà cung cấp hoàn lại cho shop khi hàng lỗi, trả hàng…).
- Team đang chấm KPI theo **GMV** (tổng giá trị đơn bán ra, không trừ refund), nhưng dashboard hiện không cung cấp số GMV riêng.

### Yêu cầu nghiệp vụ
1. **GMV** = tổng `order.total` (giá trị bán ra, không trừ refund).
2. **Customer Refund** = tổng `refundAmount` (tiền hoàn lại cho khách).
3. **Net Revenue** = GMV − Customer Refund.
4. **Vendor Refund** = số tiền nhà cung cấp hoàn lại cho shop → **không cộng vào Revenue**, **cộng vào Profit** (giảm chi phí thực tế, tăng lợi nhuận).

### Công thức P&L sau khi cập nhật

```
GMV                  = Σ order.total
Customer Refund      = Σ order.refundAmount
Net Revenue          = GMV - Customer Refund

COGS (net)           = COGS - Vendor Refund
Gross Profit         = Net Revenue - COGS (net)
Net Profit           = Gross Profit - Transaction Fees - Ads Cost
Profit Margin        = Net Profit / Net Revenue × 100
ROAS                 = Net Revenue / Ads Cost
```

---

## 2. Thay Đổi Schema (Database)

### 2.1 Thêm field `vendorRefundAmount` vào model `Order`

```prisma
model Order {
  ...
  refundAmount         Decimal  @default(0) @db.Decimal(10, 2)  // Tiền hoàn lại cho khách
  vendorRefundAmount   Decimal  @default(0) @db.Decimal(10, 2)  // Nhà cung cấp hoàn lại (giảm chi phí)
  ...
}
```

**Lý do không rename `refundAmount`:** backward-compatible, tránh breaking migration phức tạp. Chỉ bổ sung thêm field mới.

### 2.2 Migration SQL

```sql
ALTER TABLE "Order" ADD COLUMN "vendorRefundAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
```

File migration: `prisma/migrations/YYYYMMDDHHMMSS_add_vendor_refund/migration.sql`

---

## 3. Thay Đổi Calculation Engine

**File:** `lib/calculations/pnl.ts`

### 3.1 Cập nhật interface `Order`

```ts
interface Order {
  id: string
  total: number
  refundAmount: number          // Customer refund
  vendorRefundAmount: number    // Vendor refund (tăng profit)
  totalCOGS: number
  transactionFee: number
  allocatedAdsCost: number
}
```

### 3.2 Cập nhật interface `PLMetrics`

```ts
interface PLMetrics {
  gmv: number              // MỚI: tổng order.total
  customerRefund: number   // MỚI: tổng refundAmount
  vendorRefund: number     // MỚI: tổng vendorRefundAmount
  revenue: number          // Net Revenue = GMV - customerRefund (giữ key 'revenue' cho backward compat)
  cogs: number
  grossProfit: number
  grossMargin: number
  transactionFees: number
  adsCosts: number
  netProfit: number
  profitMargin: number
  roas: number | null
}
```

### 3.3 Cập nhật `calculateAggregatePL`

```ts
// GMV = tổng order.total (không trừ refund)
const gmv = orders.reduce((sum, o) => sum + Number(o.total), 0)

// Customer refund
const totalCustomerRefund = orders.reduce((sum, o) => sum + Number(o.refundAmount), 0)

// Net Revenue
const totalRevenue = gmv - totalCustomerRefund

// Vendor refund
const totalVendorRefund = orders.reduce((sum, o) => sum + Number(o.vendorRefundAmount), 0)

// COGS (net of vendor refund)
const totalCOGS = orders.reduce((sum, o) => sum + Number(o.totalCOGS), 0)
const netCOGS = totalCOGS - totalVendorRefund

// Gross Profit
const grossProfit = totalRevenue - netCOGS

// Net Profit
const netProfit = grossProfit - totalTransactionFees - totalAdsCosts
```

### 3.4 Cập nhật `calculateOrderPL` (order-level cache)

Cần tính lại khi recalculate P&L theo từng order:
- `grossProfit = (total - refundAmount) - (totalCOGS - vendorRefundAmount)`
- `netProfit = grossProfit - transactionFee - allocatedAdsCost`

---

## 4. Thay Đổi API

### 4.1 `/api/pnl` — Aggregate P&L

**Thay đổi response** (thêm fields, giữ nguyên `revenue` = net revenue để backward compat):

```json
{
  "groupBy": "total",
  "gmv": 50000,
  "customerRefund": 2000,
  "vendorRefund": 500,
  "revenue": 48000,       // Net Revenue = GMV - customerRefund (backward compat)
  "cogs": 20000,
  "grossProfit": 28500,   // = revenue - (cogs - vendorRefund)
  "netProfit": 15000,
  ...
}
```

**Select thêm field từ DB:**
```ts
select: {
  ...
  vendorRefundAmount: true,   // THÊM
}
```

### 4.2 `/api/reports/daily` — Báo cáo ngày

Thêm fields vào `DayMetrics`:
- `gmv: number`
- `customerRefund: number`
- `vendorRefund: number`

Response mỗi row thêm:
```json
{
  "date": "2026-03-01",
  "gmv": 5000,
  "customerRefund": 200,
  "vendorRefund": 50,
  "revenue": 4800,
  ...
}
```

### 4.3 `/api/reports/store` — Báo cáo cửa hàng

Tương tự, thêm `gmv`, `customerRefund`, `vendorRefund` vào `StoreAgg`.

### 4.4 `/api/reports/sku` — Báo cáo SKU

SKU-level không phân bổ vendor refund (vendor refund là order-level). Chỉ thêm `gmv` và `customerRefund` theo tỷ lệ (proportion), không bắt buộc trong phase này — có thể để todo.

---

## 5. Thay Đổi Orders Page / Sync

### 5.1 Sync từ platform

Hiện tại `refundAmount` được sync từ Shopbase/WooCommerce. `vendorRefundAmount` sẽ là **nhập thủ công** (vì platform không có khái niệm này). Không cần thay đổi sync logic.

### 5.2 Order detail view

Hiển thị thêm dòng "Vendor Refund" trong breakdown P&L của từng đơn hàng (Orders page).

---

## 6. Thay Đổi UI

### 6.1 KPICards — Dashboard

**Đổi tên card hiện tại:**
- `"Total Revenue"` → `"Net Revenue"` (cùng giá trị, chỉ đổi label)

**Thêm card mới:**
- `GMV` (Gross Merchandise Value)
- `Customer Refund`
- `Vendor Refund`

**Vị trí đề xuất** (8 cards hiện tại → 10 cards hoặc giữ 8 bằng cách group):
- Option A: Thêm 2 card mới (GMV + Net Revenue thay 1 card) → tổng 9 cards
- Option B: Gộp "Refund Info" thành 1 card mini hiển thị cả 2 chiều

→ **Ưu tiên Option A** (rõ ràng hơn cho KPI tracking).

**Grid layout:** Từ `lg:grid-cols-4` có thể chuyển sang thêm row hoặc dùng breakpoint lớn hơn.

### 6.2 RevenueProfitComboChart

Thêm series `gmv` vào chart (dashed line) để so sánh GMV vs Net Revenue.

### 6.3 DailyReportTable

Thêm cột `GMV`, `Customer Refund`, `Vendor Refund` (có thể toggle show/hide).

### 6.4 StoreComparisonTable

Thêm `gmv` vào bảng so sánh.

---

## 7. Thay Đổi i18n

### `messages/vi.json`

```json
"kpi": {
  "gmv": "GMV",
  "netRevenue": "Doanh Thu Thuần",
  "customerRefund": "Hoàn Tiền Khách",
  "vendorRefund": "NCC Hoàn Tiền",
  "totalRevenue": "Tổng Doanh Thu"   // giữ lại để dùng chỗ khác nếu cần
}
```

### `messages/en.json`

```json
"kpi": {
  "gmv": "GMV",
  "netRevenue": "Net Revenue",
  "customerRefund": "Customer Refund",
  "vendorRefund": "Vendor Refund"
}
```

---

## 8. Thứ Tự Triển Khai

| # | Task | File(s) | Ghi chú |
|---|------|---------|---------|
| 1 | Migration: thêm `vendorRefundAmount` | `prisma/schema.prisma`, migration SQL | Không breaking |
| 2 | Cập nhật interface + `calculateAggregatePL` | `lib/calculations/pnl.ts` | Thêm fields mới |
| 3 | Cập nhật cached P&L (`calculateOrderPL`) | `lib/calculations/pnl.ts` | Ảnh hưởng recalculate |
| 4 | Cập nhật `/api/pnl` | `app/api/pnl/route.ts` | Thêm gmv, customerRefund, vendorRefund |
| 5 | Cập nhật `/api/reports/daily` | `app/api/reports/daily/route.ts` | |
| 6 | Cập nhật `/api/reports/store` | `app/api/reports/store/route.ts` | |
| 7 | Cập nhật i18n | `messages/vi.json`, `messages/en.json` | |
| 8 | Cập nhật KPICards UI | `components/dashboard/KPICards.tsx` | Thêm card GMV, đổi label |
| 9 | Cập nhật dashboard page | `app/dashboard/page.tsx` | Truyền props mới |
| 10 | Cập nhật DailyReportTable | `components/reports/DailyReportTable.tsx` | Thêm cột mới |
| 11 | Cập nhật StoreComparisonTable | `components/reports/StoreComparisonTable.tsx` | Thêm GMV |
| 12 | Cập nhật RevenueProfitComboChart | `components/dashboard/RevenueProfitComboChart.tsx` | Thêm series GMV (optional) |
| 13 | Orders page: hiển thị vendor refund | `app/dashboard/orders/page.tsx` | Input nhập thủ công |

---

## 9. Backward Compatibility

- Giữ nguyên key `revenue` trong tất cả API response (= net revenue) để không vỡ component nào đang dùng.
- Thêm `gmv`, `customerRefund`, `vendorRefund` là **additive** (thêm field mới, không xóa field cũ).
- Component cũ chưa dùng field mới vẫn hoạt động bình thường.

---

## 10. Scope Ngoài Phase Này (Tạm Bỏ Qua)

- SKU-level phân bổ vendor refund theo proportion.
- Export Excel bổ sung cột GMV / Customer Refund / Vendor Refund.
- API sync vendor refund tự động từ platform (platform không hỗ trợ, nên nhập thủ công là đủ).
- Lịch sử vendor refund (audit trail).

---

## 11. Câu Hỏi Cần Chốt Trước Khi Code

- [x] Vendor refund cộng vào Profit (giảm chi phí), không cộng vào Revenue → **ĐÃ CHỐT**
- [ ] `vendorRefundAmount` nhập ở đâu trong UI? Đề xuất: trong trang Orders, thêm trường edit inline hoặc trong order detail modal.
- [ ] Có cần phân bổ `vendorRefundAmount` theo từng order item / SKU không? Đề xuất: **không** trong phase này, để order-level.
- [ ] Recalculate cached P&L (`grossProfit`, `netProfit` columns trong DB) sau khi thêm `vendorRefundAmount` không? Đề xuất: **có**, chạy migration recalc script.
