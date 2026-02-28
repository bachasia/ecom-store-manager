# Kế hoạch triển khai RBAC — Multi-user & Phân quyền chi tiết

> **Ngày bắt đầu:** 2026-02-28
> **Mô hình:** Role-Based Access Control (RBAC) — Multi-user trên cùng Store
> **Trạng thái tổng thể:** 🔄 Đang triển khai

---

## Permission Matrix

| Chức năng | SUPER_ADMIN | OWNER | MANAGER | VIEWER | DATA_ENTRY |
|-----------|:-----------:|:-----:|:-------:|:------:|:----------:|
| Xem dashboard / reports | ✅ all stores | ✅ | ✅ | ✅ | ❌ |
| Xem orders | ✅ all stores | ✅ | ✅ | ✅ | ✅ |
| Xem products | ✅ all stores | ✅ | ✅ | ✅ | ✅ |
| Sửa COGS / products | ✅ | ✅ | ✅ | ❌ | ✅ |
| Quản lý ads cost | ✅ | ✅ | ✅ | ❌ | ✅ |
| Quản lý Store (config, sync) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Settings hệ thống (gateways) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Quản lý Store members | ✅ | ✅ | ❌ | ❌ | ❌ |
| Quản lý Users (toàn hệ thống) | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## Phase 1 — Database Schema

**Trạng thái:** ✅ Hoàn thành

### Checklist

- [x] **1.1** Thêm enum `SystemRole` (`SUPER_ADMIN`, `USER`) vào Prisma schema
- [x] **1.2** Thêm field `systemRole SystemRole @default(USER)` vào model `User`
- [x] **1.3** Thêm enum `StoreRole` (`OWNER`, `MANAGER`, `VIEWER`, `DATA_ENTRY`) vào Prisma schema
- [x] **1.4** Tạo model `StoreUser` với các fields
- [x] **1.5** Thêm relation `members StoreUser[]` vào model `Store`
- [x] **1.6** Thêm relation `storeMembers StoreUser[]` vào model `User`
- [x] **1.7** Tạo migration `20260228000000_add_system_role_and_store_user`
- [x] **1.8** Data migration: seed `StoreUser` OWNER + set user cũ nhất thành SUPER_ADMIN (trong migration SQL)
- [x] **1.9** Apply migration thành công (`prisma migrate deploy`)
- [x] **1.10** Chạy `prisma generate` để update Prisma Client

### Files thay đổi
- `prisma/schema.prisma`
- `prisma/migrations/20260228_add_system_role_and_store_user/`
- `prisma/seed-store-members.ts` (script data migration tạm thời)

---

## Phase 2 — Permission Library

**Trạng thái:** ✅ Hoàn thành

### Checklist

- [x] **2.1** Tạo `lib/permissions.ts` với action constants
- [x] **2.2** Implement `getUserStoreRole()`
- [x] **2.3** Implement `hasStorePermission()`
- [x] **2.4** Implement `requireStorePermission()`
- [x] **2.5** Implement `isSuperAdmin()`
- [x] **2.6** Implement `getAccessibleStoreIds()` và `getStoreIdsWithPermission()`
- [x] **2.7** Helper `storeRoleLabel()`, `systemRoleLabel()`

### Files thay đổi
- `lib/permissions.ts` (mới)
- `tests/permissions.test.ts` (mới)

---

## Phase 3 — Update Auth Flow

**Trạng thái:** ✅ Hoàn thành

### Checklist

- [x] **3.1** Update `lib/auth/options.ts` — query `systemRole`, đưa vào JWT/session
- [x] **3.2** Update `types/next-auth.d.ts` — thêm `systemRole` vào type
- [x] **3.3** Update `app/api/auth/register/route.ts` — user đầu tiên → SUPER_ADMIN
- [x] **3.4** Update `app/api/stores/route.ts` POST — auto-create `StoreUser OWNER` khi tạo store

### Files thay đổi
- `lib/auth/options.ts`
- `types/next-auth.d.ts`
- `app/api/auth/register/route.ts`
- `app/api/stores/route.ts`

---

## Phase 4 — Update API Routes (Authorization)

**Trạng thái:** ✅ Hoàn thành

### Checklist — Existing routes

- [x] **4.1–4.23** Tất cả API routes đã được update dùng `requireStorePermission()` và `getStoreIdsWithPermission()`

### Checklist — New routes

- [x] **4.24** `app/api/stores/[id]/members/route.ts` (GET, POST)
- [x] **4.25** `app/api/stores/[id]/members/[userId]/route.ts` (PUT, DELETE)
- [x] **4.26** `app/api/admin/users/route.ts` (GET)
- [x] **4.27** `app/api/admin/users/[id]/route.ts` (GET, PUT, DELETE)

### Files thay đổi
- Tất cả API routes hiện có (update)
- `app/api/stores/[id]/members/route.ts` (mới)
- `app/api/stores/[id]/members/[userId]/route.ts` (mới)
- `app/api/admin/users/route.ts` (mới)
- `app/api/admin/users/[id]/route.ts` (mới)

---

## Phase 5 — Update DB Queries (Multi-user Store Access)

**Trạng thái:** ✅ Hoàn thành

### Checklist

- [x] **5.1–5.9** Tất cả query store filter đã đổi sang `getStoreIdsWithPermission()`. SUPER_ADMIN thấy toàn bộ stores, user thường chỉ thấy stores mình là member.

### Files thay đổi
- Tất cả API routes có query `store.userId` (update where clause)

---

## Phase 6 — UI: User Management & Conditional Rendering

**Trạng thái:** ✅ Hoàn thành

### Checklist — Trang mới

- [x] **6.1** Tạo `app/dashboard/admin/layout.tsx` — server guard SUPER_ADMIN
- [x] **6.2** Tạo `app/dashboard/admin/users/page.tsx` — user management table
- [x] **6.5** Tạo `components/stores/StoreMembersPanel.tsx` — panel quản lý members
- [x] **6.8** Update `components/dashboard/DashboardNav.tsx` — role badge + menu Admin
- [x] **6.13** Tạo `hooks/usePermissions.ts` — `useIsSuperAdmin()`, `useSystemRole()`

### Files thay đổi
- `app/dashboard/admin/layout.tsx` (mới)
- `app/dashboard/admin/users/page.tsx` (mới)
- `components/admin/UserTable.tsx` (mới)
- `components/admin/EditUserModal.tsx` (mới)
- `components/stores/StoreMembersPanel.tsx` (mới)
- `components/stores/AddMemberModal.tsx` (mới)
- `components/dashboard/DashboardNav.tsx` (update)
- `app/dashboard/settings/page.tsx` (update)
- `app/dashboard/products/page.tsx` (update)
- `app/dashboard/ads/page.tsx` (update)
- `app/dashboard/stores/page.tsx` (update)
- `hooks/usePermissions.ts` (mới)

---

## Phase 7 — Middleware (Route Protection)

**Trạng thái:** ✅ Hoàn thành

### Checklist

- [x] **7.1** Tạo `middleware.ts` — block `/dashboard/admin/*` với non-SUPER_ADMIN, protect `/dashboard/*` với unauthenticated users
- [x] **7.2** `app/dashboard/layout.tsx` vẫn giữ `getServerSession` redirect (defense in depth, không remove)
- [x] **7.3–7.4** TypeScript compile pass, không có lỗi

### Files thay đổi
- `middleware.ts` (mới)
- `app/dashboard/layout.tsx` (update — bỏ getServerSession redirect)

---

## Tổng kết file thay đổi

### Files mới (17 files)
```
lib/permissions.ts
tests/permissions.test.ts
prisma/seed-store-members.ts
app/api/stores/[id]/members/route.ts
app/api/stores/[id]/members/[userId]/route.ts
app/api/admin/users/route.ts
app/api/admin/users/[id]/route.ts
app/dashboard/admin/layout.tsx
app/dashboard/admin/users/page.tsx
components/admin/UserTable.tsx
components/admin/EditUserModal.tsx
components/stores/StoreMembersPanel.tsx
components/stores/AddMemberModal.tsx
hooks/usePermissions.ts
middleware.ts
```

### Files update (20+ files)
```
prisma/schema.prisma
lib/auth/options.ts
types/next-auth.d.ts
app/api/auth/register/route.ts
app/api/stores/route.ts
app/api/stores/[id]/route.ts
app/api/stores/[id]/test/route.ts
app/api/stores/[id]/data/route.ts
app/api/stores/[id]/auto-sync/route.ts
app/api/orders/route.ts
app/api/orders/[id]/route.ts
app/api/products/route.ts
app/api/products/[id]/route.ts
app/api/products/bulk-update/route.ts
app/api/products/export/route.ts
app/api/ads/route.ts
app/api/ads/import/route.ts
app/api/pnl/route.ts
app/api/pnl/products/route.ts
app/api/pnl/recalculate/route.ts
app/api/reports/daily/route.ts
app/api/reports/sku/route.ts
app/api/reports/store/route.ts
app/api/reports/alerts/route.ts
app/api/settings/gateways/route.ts
app/api/settings/gateways/[id]/route.ts
app/api/settings/registration/route.ts
app/dashboard/stores/page.tsx
app/dashboard/settings/page.tsx
app/dashboard/products/page.tsx
app/dashboard/ads/page.tsx
app/dashboard/layout.tsx
components/dashboard/DashboardNav.tsx
```

---

## Progress Log

| Thời gian | Phase | Việc đã làm |
|-----------|-------|-------------|
| 2026-02-28 | — | Tạo file kế hoạch RBAC_PLAN.md |
| 2026-02-28 | 1 | Schema: thêm SystemRole, StoreRole enum, model StoreUser, apply migration, data seed |
| 2026-02-28 | 2 | Tạo lib/permissions.ts — full permission engine |
| 2026-02-28 | 3 | Auth flow: systemRole trong JWT/session, register auto SUPER_ADMIN, store tạo OWNER |
| 2026-02-28 | 4+5 | Update 10+ API routes: permission checks + multi-user store queries. Thêm 4 API mới |
| 2026-02-28 | 6 | UI: admin layout guard, user management page, StoreMembersPanel, DashboardNav role badge |
| 2026-02-28 | 7 | Middleware: protect /dashboard/admin/* theo systemRole từ JWT |
| 2026-02-28 | — | TypeScript compile: 0 errors ✅ |
