# Auto Sync — ShopBase Orders & Products

Tính năng tự động sync định kỳ orders và products từ ShopBase, không cần thao tác thủ công.

---

## Kiến trúc

- **Cron runner:** `node-cron` khởi động qua `instrumentation.ts` (Next.js server startup hook)
- **Trigger:** Mỗi 5 phút cron check stores nào đến giờ sync → gọi nội bộ `/api/cron/sync`
- **Bảo vệ:** `CRON_SECRET` header — đã có sẵn trong env và Docker Compose
- **Lock:** Tái dụng cơ chế `lastSyncStatus = 'in_progress'` — cron nhận 409 nếu đang sync thủ công
- **Incremental orders:** `updated_at_min` param (đã có)
- **Incremental products:** Skip-unchanged dựa trên `product.updated_at` (ShopBase không hỗ trợ filter API)

---

## Checklist triển khai

### Phase 1 — Nền tảng

- [x] **1.1** Schema migration — thêm fields vào `Store`:
  - `autoSyncEnabled Boolean @default(false)`
  - `autoSyncInterval Int @default(60)` (phút, min=15)
  - `lastOrderAutoSyncAt DateTime?`
  - `lastProductAutoSyncAt DateTime?`

- [x] **1.2** Thêm `withRetry` wrapper vào `lib/integrations/shopbase.ts`
  - 3 lần retry, exponential backoff: 1s → 2s → 4s
  - Xử lý 429 (đọc `Retry-After` header)
  - Xử lý 5xx server errors
  - Không retry 401 / 403 / 404

- [x] **1.3** Skip-unchanged products trong `app/api/sync/products/[storeId]/route.ts`
  - So sánh `product.updated_at` với `lastProductAutoSyncAt`
  - Chỉ upsert nếu product thực sự thay đổi
  - Vẫn chạy deactivation pass khi force full sync

### Phase 2 — Cron endpoint

- [x] **2.1** Tạo `app/api/cron/sync/route.ts`
  - `GET /api/cron/sync` — bảo vệ bằng `Authorization: Bearer <CRON_SECRET>`
  - Lấy tất cả stores có `autoSyncEnabled = true`
  - Check từng store: nếu `now - lastOrderAutoSyncAt >= autoSyncInterval` → trigger sync orders
  - Check products: nếu chưa sync products trong 24h → trigger sync products
  - Fire-and-forget từng store (không block), log kết quả
  - Trả về summary `{ triggered: [...], skipped: [...] }`

- [x] **2.2** Tạo `lib/cron/scheduler.ts`
  - `node-cron` schedule `*/5 * * * *` (check mỗi 5 phút)
  - Gọi `GET /api/cron/sync` nội bộ
  - Guard: chỉ chạy khi `NODE_ENV === 'production'`

- [x] **2.3** Tạo `instrumentation.ts` ở root
  - Next.js 14+ server startup hook
  - Import và khởi động scheduler từ `lib/cron/scheduler.ts`

- [x] **2.4** Cài package `node-cron`
  - `npm install node-cron`
  - `npm install -D @types/node-cron`

### Phase 3 — Settings API

- [x] **3.1** Tạo `app/api/stores/[storeId]/auto-sync/route.ts`
  - `PATCH` — cập nhật `autoSyncEnabled`, `autoSyncInterval`
  - Validate: `autoSyncInterval` >= 15
  - Auth: chỉ owner của store

- [x] **3.2** Tạo `components/stores/AutoSyncSettings.tsx`
  - Toggle **Enable Auto Sync**
  - Dropdown **Sync interval**: 15 / 30 / 60 / 120 / 360 phút
  - Readonly: **Last sync** orders & products (từ `lastOrderAutoSyncAt` / `lastProductAutoSyncAt`)
  - Readonly: **Next sync** (tính từ interval)
  - Hiển thị `lastSyncStatus` nếu đang chạy

- [x] **3.3** Mount `AutoSyncSettings` vào trang Stores

### Phase 4 — Hoàn thiện

- [x] **4.1** Cập nhật `.env.example` — document `CRON_SECRET` rõ ràng hơn

- [ ] **4.2** Test end-to-end
  - Bật auto sync cho 1 store ShopBase
  - Chờ cron trigger (hoặc gọi `/api/cron/sync` thủ công)
  - Kiểm tra SyncLog tạo đúng
  - Kiểm tra lock: trigger thủ công trong lúc cron đang chạy → nhận 409
  - Kiểm tra retry: mock 429 response → backoff đúng

- [ ] **4.3** Commit + push

---

## Files sẽ thay đổi

| File | Action |
|---|---|
| `prisma/schema.prisma` | Sửa — thêm 4 fields |
| `prisma/migrations/...` | Tạo — migration |
| `lib/integrations/shopbase.ts` | Sửa — withRetry |
| `app/api/sync/products/[storeId]/route.ts` | Sửa — skip-unchanged |
| `app/api/cron/sync/route.ts` | Tạo |
| `lib/cron/scheduler.ts` | Tạo |
| `instrumentation.ts` | Tạo |
| `app/api/stores/[storeId]/auto-sync/route.ts` | Tạo |
| `components/stores/AutoSyncSettings.tsx` | Tạo |
| `app/dashboard/stores/page.tsx` | Sửa — mount component |
| `.env.example` | Sửa |

---

## Rủi ro & lưu ý

| Rủi ro | Giải pháp |
|---|---|
| Cron trigger trong khi đang sync thủ công | Lock `in_progress` đã có → cron nhận 409, skip |
| ShopBase rate limit | `withRetry` đọc `Retry-After`, tăng sleep khi nhận 429 |
| `instrumentation.ts` chạy nhiều lần khi hot reload | Guard `NODE_ENV === 'production'` |
| Products full scan tốn bandwidth | Skip-unchanged theo `updated_at` — chỉ upsert rows thực sự đổi |
| Nhiều stores sync cùng lúc | Fire-and-forget, mỗi store có lock riêng |

---

## Phase 2 (tương lai) — BullMQ

Khi số stores > 10 hoặc cần visibility job queue:

```
lib/queue/
  client.ts
  workers/syncOrders.ts
  workers/syncProducts.ts
  jobs/scheduleAutoSync.ts
```

Redis đã được provisioned trong Docker Compose, chỉ cần cài `bullmq` và kết nối.
