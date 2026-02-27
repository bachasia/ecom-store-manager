# Production Fix Checklist

Danh sách các vấn đề cần fix trước khi chạy production. Fix xong đánh dấu `[x]`.

---

## CRITICAL — Phải fix trước khi deploy

- [x] **FIX-1: Encryption key hex-decode sai**
  - File: `lib/encryption.ts:10`
  - Vấn đề: `slice(0, 32)` lấy 32 ký tự ASCII thay vì hex-decode đúng 32 bytes. Key ngắn hơn 32 chars bị silently pad bằng `'0'`, không throw error.
  - Fix: Hex-decode key, validate đủ 32 bytes.

- [x] **FIX-2: PostgreSQL port exposed trong production**
  - File: `docker-compose.prod.yml:13-14`
  - Vấn đề: `ports: - "5432:5432"` → DB accessible từ ngoài internet.
  - Fix: Xóa `ports:` block của postgres trong prod compose.

- [x] **FIX-3: Health check không check DB**
  - File: `app/api/health/route.ts`
  - Vấn đề: Luôn trả 200 kể cả khi DB down → container không restart khi cần.
  - Fix: Thêm `prisma.$queryRaw\`SELECT 1\`` trả 503 nếu fail.

- [x] **FIX-4: Recalculate P&L OOM với store lớn**
  - File: `app/api/pnl/recalculate/route.ts:136`
  - Vấn đề: `prisma.$transaction(updates)` với array không giới hạn — 1,481 orders = 1,481 ops trong 1 transaction → OOM/timeout.
  - Fix: Chunk thành batch 500.

---

## HIGH — Fix sớm sau deploy

- [x] **FIX-5: Open registration không kiểm soát**
  - File: `app/api/auth/register/route.ts`
  - Vấn đề: Bất kỳ ai cũng tạo account được, không có rate limit, không có invite code.
  - Fix: Thêm setting trong Admin panel (bật/tắt allow registration). Mặc định: tắt.

- [x] **FIX-6: adsCost không bị xóa khi clear store data**
  - File: `app/api/stores/[id]/data/route.ts:31-35`
  - Vấn đề: Clear data không xóa AdsCost → P&L sai sau khi sync lại.
  - Fix: Thêm `prisma.adsCost.deleteMany({ where: { storeId } })` vào transaction.

---

## MEDIUM — Cải thiện performance/UX

- [x] **FIX-7: Thiếu compound index trên bảng Order**
  - File: `prisma/schema.prisma`
  - Vấn đề: Mọi report query filter `storeId + orderDate` nhưng chỉ có index riêng lẻ.
  - Fix: Thêm `@@index([storeId, orderDate])` và `@@index([storeId, status, orderDate])`.

- [x] **FIX-8: Dashboard load 7 API requests tuần tự**
  - File: `app/dashboard/page.tsx`
  - Vấn đề: 7 `await fetch()` chạy lần lượt → dashboard chậm.
  - Fix: `Promise.all([...])` chạy song song.

---

## Đã fix trong session này

- [x] ShopBase product sync: stream theo trang thay vì load hết vào RAM
- [x] ShopBase order sync: bỏ N+1 getOrder per-order (giảm 80% thời gian)
- [x] WooCommerce order REST fallback: dùng streaming thay vì getAllOrders
- [x] SyncLog: ghi đúng recordsCreated khi cancelled mid-sync
- [x] ShopBase client: tăng timeout 30s → 60s
- [x] `DailyReportTable`: fix React key warning (Fragment thay vì <>)
- [x] Date filter: thêm option "All time" vào tất cả dropdown
- [x] Encryption key: thêm validation nếu key không đủ độ dài
