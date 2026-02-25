# P&L Dashboard - Profit Management System

Profit and loss management dashboard for multi-store e-commerce, integrated with Shopbase and WooCommerce.

## Key Features

- ✅ Multi-store management (Shopbase & WooCommerce)
- ✅ Automatic order and product synchronization
- ✅ Advertising cost tracking (Facebook Ads, Google Ads)
- ✅ Payment fee calculation
- ✅ Detailed P&L reports (Revenue, COGS, Profit, ROAS)
- ✅ Dashboard with charts and insights
- ✅ Negative ROI alerts
- ✅ CSV report export

## Tech Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Recharts
- **Backend:** Next.js API Routes, Prisma ORM
- **Database:** PostgreSQL 16
- **Cache:** Redis (optional)
- **Auth:** NextAuth.js
- **Container:** Docker & Docker Compose
- **i18n:** next-intl (English & Vietnamese)

---

## Installation

### System Requirements

- Docker & Docker Compose
- Node.js 20+ (if running locally without Docker)
- Git

### 1. Clone Repository

```bash
git clone <repository-url>
cd pnl-dashboard
```

### 2. Configure Environment Variables

```bash
# Copy .env.example file
cp .env.example .env.local

# Edit .env.local with your information
nano .env.local
```

**Các biến quan trọng cần cấu hình:**

```bash
# Database
DATABASE_URL="postgresql://pnl_user:pnl_password@postgres:5432/pnl_dashboard"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="<generate-with-openssl-rand-base64-32>"

# Encryption (32 bytes)
ENCRYPTION_KEY="<generate-with-openssl-rand-hex-32>"

# Cron Secret
CRON_SECRET="<random-secret>"
```

**Generate secrets:**

```bash
# Generate NextAuth Secret
openssl rand -base64 32

# Generate Encryption Key
openssl rand -hex 32
```

---

## Chạy Ứng Dụng

### Development (với Docker)

```bash
# Start tất cả services
docker-compose up

# Hoặc chạy background
docker-compose up -d

# Xem logs
docker-compose logs -f app

# Stop services
docker-compose down
```

Ứng dụng sẽ chạy tại: **http://localhost:3000**

### Development (không dùng Docker)

```bash
# Install dependencies
npm install

# Setup database (PostgreSQL phải đang chạy)
npx prisma migrate dev

# Generate Prisma Client
npx prisma generate

# Start development server
npm run dev
```

### Test Environment

```bash
# Build và chạy test environment
docker-compose -f docker-compose.test.yml up

# Run tests
docker-compose -f docker-compose.test.yml exec app npm run test
```

Ứng dụng test sẽ chạy tại: **http://localhost:3001**

### Production

```bash
# Cấu hình production environment variables
cp .env.example .env.production
nano .env.production

# Build và deploy
docker-compose -f docker-compose.prod.yml up -d

# Xem logs
docker-compose -f docker-compose.prod.yml logs -f

# Stop
docker-compose -f docker-compose.prod.yml down
```

---

## Database Management

### Migrations

```bash
# Tạo migration mới
docker-compose exec app npx prisma migrate dev --name migration_name

# Apply migrations (production)
docker-compose exec app npx prisma migrate deploy

# Reset database (development only)
docker-compose exec app npx prisma migrate reset
```

### Prisma Studio (Database GUI)

```bash
# Mở Prisma Studio
docker-compose exec app npx prisma studio
```

Truy cập tại: **http://localhost:5555**

### Seed Data

```bash
# Chạy seed script
docker-compose exec app npx prisma db seed
```

### Backup & Restore

```bash
# Backup database
docker-compose exec postgres pg_dump -U pnl_user pnl_dashboard > backup.sql

# Restore database
docker-compose exec -T postgres psql -U pnl_user pnl_dashboard < backup.sql
```

---

## Cấu Trúc Dự Án

```
pnl-dashboard/
├── prisma/
│   ├── schema.prisma          # Database schema
│   ├── migrations/            # Database migrations
│   └── seed.ts               # Seed data
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── (auth)/          # Auth pages
│   │   ├── (dashboard)/     # Dashboard pages
│   │   └── api/             # API routes
│   ├── components/          # React components
│   ├── lib/                 # Utilities & integrations
│   ├── types/               # TypeScript types
│   └── hooks/               # Custom hooks
├── docker/
├── .env.example             # Environment variables template
├── docker-compose.yml       # Development
├── docker-compose.test.yml  # Test
├── docker-compose.prod.yml  # Production
├── Dockerfile.dev           # Development Dockerfile
├── Dockerfile.prod          # Production Dockerfile
├── PLAN.md                  # Kế hoạch chi tiết
└── ROADMAP.md              # Lộ trình triển khai
```

---

## API Documentation

### Authentication

```
POST   /api/auth/register    # Đăng ký
POST   /api/auth/login       # Đăng nhập
GET    /api/auth/session     # Lấy session
```

### Stores

```
GET    /api/stores           # Danh sách cửa hàng
POST   /api/stores           # Tạo cửa hàng
PUT    /api/stores/:id       # Cập nhật
DELETE /api/stores/:id       # Xóa
POST   /api/stores/:id/test  # Test kết nối
```

### Sync

```
POST   /api/sync/orders/:storeId    # Đồng bộ orders
POST   /api/sync/products/:storeId  # Đồng bộ products
GET    /api/sync/status/:storeId    # Trạng thái sync
```

### P&L Reports

```
GET    /api/pnl/overview     # Dashboard KPIs
GET    /api/pnl/daily        # Báo cáo theo ngày
GET    /api/pnl/by-store     # So sánh cửa hàng
GET    /api/pnl/by-sku       # Lợi nhuận theo SKU
```

Xem chi tiết trong **PLAN.md**

---

## Sử Dụng

### 1. Đăng Ký & Đăng Nhập

- Truy cập http://localhost:3000
- Đăng ký tài khoản mới
- Đăng nhập

### 2. Kết Nối Cửa Hàng

- Vào **Stores** → **Add Store**
- Chọn platform (Shopbase hoặc WooCommerce)
- Nhập thông tin API:
  - **Shopbase:** Store URL + API Key
  - **WooCommerce:** Store URL + Consumer Key + Consumer Secret
- Click **Test Connection** để kiểm tra
- Save

### 3. Đồng Bộ Dữ Liệu

- Vào trang **Stores**
- Click **Sync Products** để đồng bộ sản phẩm
- Click **Sync Orders** để đồng bộ đơn hàng
- Xem trạng thái sync trong **Sync Logs**

### 4. Cấu Hình Giá Vốn (COGS)

- Vào **Products**
- Tìm sản phẩm cần cập nhật
- Nhập **Base Cost** (giá vốn)
- Save
- Hoặc import hàng loạt bằng CSV

### 5. Import Chi Phí Quảng Cáo

- Vào **Ads Cost**
- Click **Import CSV**
- Chọn platform (Facebook hoặc Google)
- Upload file CSV export từ Ads Manager
- Map columns
- Import

### 6. Cấu Hình Phí Thanh Toán

- Vào **Settings** → **Payment Gateways**
- Chọn gateway (Stripe, PayPal, etc.)
- Nhập phí:
  - **Percentage:** % phí (vd: 2.9)
  - **Fixed:** Phí cố định (vd: 0.30)
- Save

### 7. Xem Dashboard

- Vào **Dashboard**
- Chọn date range
- Xem KPIs:
  - Total Revenue
  - Net Profit
  - Profit Margin %
  - ROAS
  - Total Orders
  - AOV
- Xem biểu đồ và báo cáo

### 8. Báo Cáo Chi Tiết

- **Daily Report:** Breakdown theo ngày
- **SKU Report:** Lợi nhuận theo sản phẩm
- **Store Report:** So sánh cửa hàng
- **Alerts:** Cảnh báo ROI âm

---

## Troubleshooting

### Database Connection Error

```bash
# Kiểm tra PostgreSQL đang chạy
docker-compose ps

# Restart database
docker-compose restart postgres

# Xem logs
docker-compose logs postgres
```

### Sync Errors

- Kiểm tra API credentials trong **Stores**
- Test connection
- Xem error logs trong **Sync Logs**
- Kiểm tra rate limits của platform

### Missing COGS

- Đảm bảo đã set **Base Cost** cho products
- Vào **Products** → Update costs
- Recalculate P&L: **Dashboard** → **Recalculate**

### Performance Issues

```bash
# Xem database indexes
docker-compose exec postgres psql -U pnl_user -d pnl_dashboard \
  -c "\d+ \"Order\""

# Analyze slow queries
docker-compose exec postgres psql -U pnl_user -d pnl_dashboard \
  -c "EXPLAIN ANALYZE SELECT ..."

# Clear Redis cache
docker-compose exec redis redis-cli FLUSHALL
```

---

## Development

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

### Build for Production

```bash
npm run build
npm run start
```

### Run Tests

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Coverage
npm run test:coverage
```

### Linting & Formatting

```bash
# Lint
npm run lint

# Format
npm run format
```

---

## Deployment

### Docker Production Deployment

1. **Chuẩn bị server:**
   - Install Docker & Docker Compose
   - Setup firewall (ports 80, 443)
   - Setup domain DNS

2. **Clone repository:**
   ```bash
   git clone <repo-url>
   cd pnl-dashboard
   ```

3. **Cấu hình environment:**
   ```bash
   cp .env.example .env.production
   nano .env.production
   # Update tất cả production values
   ```

4. **Setup SSL (nếu dùng Nginx):**
   ```bash
   # Install certbot
   sudo apt install certbot
   
   # Generate SSL certificate
   sudo certbot certonly --standalone -d your-domain.com
   
   # Copy certificates
   mkdir -p ssl
   sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/
   sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/
   ```

5. **Deploy:**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

6. **Verify:**
   ```bash
   docker-compose -f docker-compose.prod.yml ps
   docker-compose -f docker-compose.prod.yml logs -f
   ```

### Vercel Deployment (Alternative)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Production
vercel --prod
```

**Note:** Cần setup PostgreSQL database riêng (Neon, Supabase, Railway)

---

## Monitoring

### Health Check

```bash
curl http://localhost:3000/api/health
```

### Logs

```bash
# Application logs
docker-compose logs -f app

# Database logs
docker-compose logs -f postgres

# All logs
docker-compose logs -f
```

### Metrics

- Database size: Check PostgreSQL
- Redis memory: `docker-compose exec redis redis-cli INFO memory`
- Container stats: `docker stats`

---

## Backup Strategy

### Automated Backups

```bash
# Create backup script
cat > backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker-compose exec -T postgres pg_dump -U pnl_user pnl_dashboard > backups/backup_$DATE.sql
# Keep only last 30 days
find backups/ -name "backup_*.sql" -mtime +30 -delete
EOF

chmod +x backup.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /path/to/backup.sh
```

---

## Support

- **Documentation:** Xem PLAN.md và ROADMAP.md
- **Issues:** Tạo issue trên GitHub
- **Email:** support@your-domain.com

---

## License

MIT License

---

## Contributors

- Your Name - Initial work

---

## Changelog

### Version 1.0.0 (2026-02-25)
- Initial release
- Multi-store support (Shopbase, WooCommerce)
- P&L calculation engine
- Dashboard with charts
- Ads cost tracking
- Docker support

---

**Happy tracking! 📊💰**
