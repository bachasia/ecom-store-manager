# KẾ HOẠCH TRIỂN KHAI P&L DASHBOARD

## Tổng Quan Dự Án

Dashboard quản lý lợi nhuận/thua lỗ (P&L) cho nhiều cửa hàng thương mại điện tử, tích hợp với Shopbase và WooCommerce, theo dõi chi phí quảng cáo, phí thanh toán và tính toán lợi nhuận thực tế.

---

## 1. KIẾN TRÚC HỆ THỐNG

### 1.1 Tech Stack

**Frontend:**
- Next.js 14+ (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui components
- Recharts (biểu đồ)

**Backend:**
- Next.js API Routes
- Node.js 20+
- Prisma ORM

**Database:**
- PostgreSQL 16

**Authentication:**
- NextAuth.js

**Containerization:**
- Docker & Docker Compose
- Multi-stage builds cho production

**Background Jobs:**
- Node-cron (Phase 1)
- BullMQ + Redis (Phase 2 - nếu cần)

---

### 1.2 Cấu Trúc Thư Mục

```
pnl-dashboard/
├── prisma/
│   ├── schema.prisma              # Database schema
│   ├── migrations/                # Database migrations
│   └── seed.ts                    # Seed data
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── (auth)/               # Auth pages (login, register)
│   │   ├── (dashboard)/          # Protected dashboard pages
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx          # Main dashboard
│   │   │   ├── stores/           # Quản lý cửa hàng
│   │   │   ├── products/         # Quản lý SKU & giá vốn
│   │   │   ├── ads/              # Import chi phí quảng cáo
│   │   │   ├── settings/         # Cấu hình phí thanh toán
│   │   │   └── reports/          # Báo cáo chi tiết
│   │   └── api/                  # API Routes
│   │       ├── auth/
│   │       ├── stores/
│   │       ├── products/
│   │       ├── orders/
│   │       ├── ads/
│   │       ├── sync/
│   │       ├── pnl/
│   │       └── settings/
│   ├── components/
│   │   ├── ui/                   # shadcn/ui components
│   │   ├── dashboard/            # Dashboard components
│   │   ├── stores/               # Store management components
│   │   └── shared/               # Shared components
│   ├── lib/
│   │   ├── prisma.ts             # Prisma client
│   │   ├── auth.ts               # NextAuth config
│   │   ├── integrations/         # API integrations
│   │   │   ├── shopbase.ts
│   │   │   └── woocommerce.ts
│   │   ├── sync/                 # Sync logic
│   │   ├── calculations/         # P&L calculations
│   │   ├── parsers/              # CSV/Excel parsers
│   │   └── utils.ts
│   ├── types/                    # TypeScript types
│   └── hooks/                    # Custom React hooks
├── docker/
│   ├── Dockerfile.dev            # Development Dockerfile
│   ├── Dockerfile.prod           # Production Dockerfile
│   └── nginx.conf                # Nginx config (nếu cần)
├── .env.example
├── .env.local                    # Local development
├── .env.test                     # Test environment
├── .env.production               # Production environment
├── docker-compose.yml            # Development
├── docker-compose.test.yml       # Test environment
├── docker-compose.prod.yml       # Production
├── PLAN.md                       # File này
├── ROADMAP.md                    # Lộ trình triển khai
└── README.md                     # Hướng dẫn setup
```

---

## 2. DATABASE SCHEMA

### 2.1 Các Bảng Chính

**User** - Người dùng hệ thống
- id, email, password (hashed), name
- Quan hệ: 1:many với Store

**Store** - Cửa hàng (Shopbase/WooCommerce)
- id, userId, name, platform, apiUrl, apiKey, apiSecret
- lastSyncAt, lastSyncStatus, currency, timezone
- Quan hệ: 1:many với Product, Order, AdsCost, SyncLog

**Product** - Sản phẩm/SKU
- id, storeId, externalId, name, sku, variantName
- baseCost (COGS - giá vốn), price
- Quan hệ: 1:many với OrderItem

**Order** - Đơn hàng
- id, storeId, externalId, orderNumber, orderDate, status
- Customer info: email, name, country
- Financial: subtotal, discount, shipping, tax, total, refundAmount
- Payment: paymentMethod, paymentGatewayId, transactionFee
- Marketing: utmSource, utmMedium, utmCampaign
- P&L (cached): totalCOGS, allocatedAdsCost, grossProfit, netProfit, profitMargin
- Quan hệ: 1:many với OrderItem

**OrderItem** - Chi tiết đơn hàng
- id, orderId, productId, sku, productName
- quantity, price, total
- unitCost, totalCost (calculated)

**AdsCost** - Chi phí quảng cáo
- id, storeId, date, platform (facebook/google/manual)
- campaignName, adsetName, spend, impressions, clicks

**PaymentGateway** - Cổng thanh toán
- id, name, displayName
- feePercentage, feeFixed

**SyncLog** - Lịch sử đồng bộ
- id, storeId, syncType, status
- recordsProcessed, recordsCreated, recordsUpdated
- startedAt, completedAt, errorMessage

**AppSetting** - Cấu hình hệ thống
- id, key, value, description

### 2.2 Indexes Quan Trọng

```sql
CREATE INDEX idx_orders_store_date ON "Order"(storeId, orderDate);
CREATE INDEX idx_orders_status ON "Order"(status);
CREATE INDEX idx_orderitems_sku ON "OrderItem"(sku);
CREATE INDEX idx_products_store_sku ON "Product"(storeId, sku);
CREATE INDEX idx_adscost_store_date ON "AdsCost"(storeId, date);
```

---

## 3. API ENDPOINTS

### 3.1 Authentication
```
POST   /api/auth/register          # Đăng ký
POST   /api/auth/login             # Đăng nhập (NextAuth)
GET    /api/auth/session           # Lấy session
```

### 3.2 Store Management
```
GET    /api/stores                 # Danh sách cửa hàng
POST   /api/stores                 # Tạo cửa hàng mới
GET    /api/stores/:id             # Chi tiết cửa hàng
PUT    /api/stores/:id             # Cập nhật cửa hàng
DELETE /api/stores/:id             # Xóa cửa hàng
POST   /api/stores/:id/test        # Test kết nối API
```

### 3.3 Sync Operations
```
POST   /api/sync/orders/:storeId   # Đồng bộ đơn hàng
POST   /api/sync/products/:storeId # Đồng bộ sản phẩm
GET    /api/sync/status/:storeId   # Trạng thái đồng bộ
GET    /api/sync/logs/:storeId     # Lịch sử đồng bộ
```

### 3.4 Products & SKU
```
GET    /api/products               # Danh sách sản phẩm
PUT    /api/products/:id/cost      # Cập nhật giá vốn
PUT    /api/products/bulk-cost     # Cập nhật hàng loạt
```

### 3.5 Ads Cost
```
GET    /api/ads                    # Danh sách chi phí quảng cáo
POST   /api/ads/import             # Import CSV/Excel
POST   /api/ads/manual             # Nhập thủ công
PUT    /api/ads/:id                # Cập nhật
DELETE /api/ads/:id                # Xóa
```

### 3.6 Payment Gateway
```
GET    /api/settings/gateways      # Danh sách cổng thanh toán
POST   /api/settings/gateways      # Tạo mới
PUT    /api/settings/gateways/:id  # Cập nhật phí
```

### 3.7 P&L Reports
```
GET    /api/pnl/overview           # Tổng quan KPIs
GET    /api/pnl/daily              # Báo cáo theo ngày
GET    /api/pnl/by-store           # So sánh cửa hàng
GET    /api/pnl/by-sku             # Lợi nhuận theo SKU
GET    /api/pnl/by-country         # Theo quốc gia
GET    /api/pnl/by-utm             # Theo nguồn UTM
GET    /api/pnl/alerts             # Cảnh báo ROI âm
POST   /api/pnl/recalculate        # Tính toán lại
```

---

## 4. TÍCH HỢP API

### 4.1 Shopbase API

**Authentication:** API Key (X-ShopBase-Access-Token header)

**Base URL:** `https://{store-name}.onshopbase.com`

**Endpoints:**
```
GET /admin/orders.json
  - Params: created_at_min, created_at_max, limit, page, status
  - Lấy danh sách đơn hàng

GET /admin/products.json
  - Params: limit, page
  - Lấy danh sách sản phẩm
```

**Rate Limit:** 2 requests/second

### 4.2 WooCommerce API

**Authentication:** OAuth 1.0a hoặc Basic Auth (consumer_key + consumer_secret)

**Base URL:** `https://{store-url}/wp-json/wc/v3`

**Endpoints:**
```
GET /orders
  - Params: after, before, per_page (max 100), page, status
  - Lấy danh sách đơn hàng

GET /products
  - Params: per_page, page
  - Lấy danh sách sản phẩm

GET /products/{id}/variations
  - Lấy biến thể sản phẩm
```

**Rate Limit:** Tùy hosting (thường 10-25 req/sec)

### 4.3 Chiến Lược Đồng Bộ

**Incremental Sync:**
1. Lưu `lastSyncAt` cho mỗi store
2. Chỉ lấy orders mới/cập nhật từ `lastSyncAt`
3. Xử lý theo batch (50-100 orders/request)
4. Cập nhật `lastSyncAt` sau khi hoàn thành

**Error Handling:**
- Retry 3 lần với exponential backoff
- Log lỗi vào SyncLog
- Tiếp tục xử lý các records còn lại
- Thông báo lỗi cho user

---

## 5. CÔNG THỨC TÍNH P&L

### 5.1 Các Chỉ Số Cơ Bản

```
Revenue (Doanh thu) = Order Total (sau discount)

COGS (Giá vốn) = Σ(Base Cost × Quantity) cho tất cả line items

Transaction Fee (Phí giao dịch) = 
  (Order Total × Gateway Fee %) + Gateway Fixed Fee

Ads Cost (Chi phí quảng cáo) = 
  Phân bổ theo ngày (2 phương pháp)

Gross Profit (Lợi nhuận gộp) = Revenue - COGS

Net Profit (Lợi nhuận ròng) = 
  Revenue - COGS - Transaction Fee - Ads Cost

Profit Margin % = (Net Profit / Revenue) × 100

ROAS (Return on Ad Spend) = Revenue / Ads Cost

AOV (Average Order Value) = Total Revenue / Number of Orders
```

### 5.2 Phân Bổ Chi Phí Quảng Cáo

**Phương pháp 1: Chia đều (Equal Split)**
```
Order Ads Cost = Daily Ad Spend / Number of Orders That Day
```

**Phương pháp 2: Theo tỷ lệ doanh thu (Revenue-Weighted)**
```
Order Ads Cost = (Order Total / Daily Total Revenue) × Daily Ad Spend
```

Mặc định: Revenue-Weighted (chính xác hơn)

---

## 6. BẢO MẬT

### 6.1 Mã Hóa API Credentials

```typescript
// AES-256-CBC encryption
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 32 bytes
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    'aes-256-cbc', 
    Buffer.from(ENCRYPTION_KEY), 
    iv
  );
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string): string {
  const parts = text.split(':');
  const iv = Buffer.from(parts.shift(), 'hex');
  const encrypted = Buffer.from(parts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc', 
    Buffer.from(ENCRYPTION_KEY), 
    iv
  );
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}
```

### 6.2 Các Biện Pháp Bảo Mật

- ✅ Mã hóa API keys trong database
- ✅ HTTPS cho tất cả API calls
- ✅ Rate limiting trên auth endpoints
- ✅ CSRF protection (NextAuth built-in)
- ✅ SQL injection prevention (Prisma ORM)
- ✅ XSS protection (React built-in)
- ✅ Environment variables cho secrets
- ✅ Không expose decrypted keys trong API responses

---

## 7. DOCKER CONFIGURATION

### 7.1 Development Environment

**docker-compose.yml:**
- Next.js app (hot reload)
- PostgreSQL
- Redis (optional)
- Volumes cho code và database

### 7.2 Test Environment

**docker-compose.test.yml:**
- Next.js app (production build)
- PostgreSQL (test database)
- Automated tests
- Isolated network

### 7.3 Production Environment

**docker-compose.prod.yml:**
- Next.js app (optimized build)
- PostgreSQL (persistent volume)
- Redis (caching)
- Nginx (reverse proxy - optional)
- Health checks
- Restart policies

---

## 8. BIẾN MÔI TRƯỜNG

```bash
# Database
DATABASE_URL="postgresql://user:pass@postgres:5432/pnl_dashboard"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"

# Encryption
ENCRYPTION_KEY="generate-32-byte-key-for-aes-256"

# Cron Jobs
CRON_SECRET="random-secret-for-cron-auth"

# Redis (optional)
REDIS_URL="redis://redis:6379"

# Node Environment
NODE_ENV="development" # hoặc "production"
```

---

## 9. DASHBOARD FEATURES

### 9.1 Trang Tổng Quan (Overview)

**KPI Cards:**
- Total Revenue (Tổng doanh thu)
- Net Profit (Lợi nhuận ròng)
- Profit Margin % (Tỷ suất lợi nhuận)
- ROAS (Hiệu quả quảng cáo)
- Total Orders (Tổng đơn hàng)
- AOV (Giá trị đơn hàng trung bình)
- Total COGS (Tổng giá vốn)

**Biểu Đồ:**
1. Revenue vs Profit (Bar + Line combo) - theo ngày
2. Ads Spend & ROAS Trend - theo ngày
3. Store Comparison (Horizontal bar) - so sánh cửa hàng
4. Revenue by UTM Source (Pie/Bar chart)
5. Revenue by Country (Map/Bar chart)

**Filters:**
- Date range picker (today, this week, this month, custom)
- Store filter (all stores, specific store)

### 9.2 Báo Cáo Chi Tiết

**Daily Report:**
- Breakdown theo từng ngày
- Drilldown vào từng store
- Hiển thị orders, revenue, costs, profit

**SKU Report:**
- Lợi nhuận theo từng SKU
- Top profitable products
- Loss-making products

**Store Report:**
- So sánh performance giữa các store
- Trends theo thời gian

**Alerts:**
- Days with negative ROI
- Days with ROAS below threshold
- Missing COGS warnings

---

## 10. TESTING STRATEGY

### 10.1 Unit Tests
- P&L calculation logic
- Encryption/decryption functions
- Data parsers (CSV/Excel)

### 10.2 Integration Tests
- API endpoints
- Database operations
- Sync logic

### 10.3 E2E Tests (Critical Flows)
- User login → Add store → Sync → View dashboard
- Import ads cost → Recalculate P&L
- Update product costs → Verify calculations

---

## 11. DEPLOYMENT

### 11.1 Development
```bash
docker-compose up
```

### 11.2 Test
```bash
docker-compose -f docker-compose.test.yml up
npm run test
```

### 11.3 Production
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 11.4 CI/CD Pipeline (Khuyến nghị)
1. GitHub Actions / GitLab CI
2. Run tests on push
3. Build Docker images
4. Push to registry
5. Deploy to server
6. Run migrations
7. Health check

---

## 12. MONITORING & MAINTENANCE

### 12.1 Logging
- Application logs (Winston/Pino)
- Sync logs (database)
- Error tracking (Sentry - optional)

### 12.2 Monitoring
- Database performance
- API response times
- Sync success rates
- Error rates

### 12.3 Backups
- Daily database backups
- Retention policy (30 days)
- Automated backup scripts

---

## 13. FUTURE ENHANCEMENTS

- Multi-currency support
- Profit forecasting
- Email reports (weekly/monthly)
- Webhook support for real-time sync
- Mobile app
- Team collaboration
- Advanced analytics (cohort, LTV)
- More platform integrations (Shopify, Amazon, Etsy)
- AI-powered insights

---

## KẾT LUẬN

Đây là kế hoạch chi tiết và toàn diện cho P&L Dashboard. Tất cả các yêu cầu đã được phân tích và thiết kế kỹ lưỡng. 

Xem file **ROADMAP.md** để biết lộ trình triển khai từng phase.

Xem file **README.md** để biết hướng dẫn setup và chạy dự án.
