# LỘ TRÌNH TRIỂN KHAI P&L DASHBOARD

## Tổng Quan

Dự án được chia thành 8 phases, ước tính hoàn thành trong 10 tuần. Mỗi phase có mục tiêu rõ ràng và deliverables cụ thể.

---

## PHASE 1: Foundation & Authentication (Tuần 1)

### Mục Tiêu
Thiết lập nền tảng dự án và hệ thống xác thực người dùng

### Tasks

#### 1.1 Project Setup
- [ ] Initialize Next.js 14 project với TypeScript
- [ ] Cấu hình Tailwind CSS
- [ ] Install và setup shadcn/ui
- [ ] Cấu hình ESLint và Prettier
- [ ] Setup Git repository

#### 1.2 Docker Configuration
- [ ] Tạo Dockerfile.dev cho development
- [ ] Tạo Dockerfile.prod cho production
- [ ] Tạo docker-compose.yml (dev)
- [ ] Tạo docker-compose.test.yml
- [ ] Tạo docker-compose.prod.yml
- [ ] Cấu hình PostgreSQL container
- [ ] Cấu hình Redis container (optional)

#### 1.3 Database Setup
- [ ] Initialize Prisma
- [ ] Tạo schema.prisma với tất cả models
- [ ] Tạo initial migration
- [ ] Tạo seed script cho development data
- [ ] Test database connection

#### 1.4 Authentication
- [ ] Setup NextAuth.js
- [ ] Tạo User model và Account/Session models
- [ ] Implement email/password authentication
- [ ] Tạo login page UI
- [ ] Tạo register page UI
- [ ] Implement password hashing (bcryptjs)
- [ ] Tạo middleware cho protected routes
- [ ] Test authentication flow

#### 1.5 Layout & Navigation
- [ ] Tạo main layout structure
- [ ] Tạo dashboard layout với sidebar
- [ ] Tạo navigation menu
- [ ] Tạo user profile dropdown
- [ ] Implement responsive design

### Deliverables
✅ Project chạy được trên Docker  
✅ Database connected và migrated  
✅ Authentication hoạt động (login/register/logout)  
✅ Protected routes  
✅ Basic UI layout

### Testing
```bash
# Start development environment
docker-compose up

# Run migrations
docker-compose exec app npx prisma migrate dev

# Test authentication
# - Register new user
# - Login
# - Access protected route
# - Logout
```

---

## PHASE 2: Store Management & API Integration (Tuần 2)

### Mục Tiêu
Cho phép users kết nối và quản lý cửa hàng

### Tasks

#### 2.1 Store Model & API
- [ ] Tạo Store API endpoints (CRUD)
- [ ] Implement API credential encryption
- [ ] Tạo validation schemas (Zod)
- [ ] Test API endpoints

#### 2.2 Store Management UI
- [ ] Tạo stores list page
- [ ] Tạo add store form
- [ ] Tạo edit store form
- [ ] Tạo delete confirmation dialog
- [ ] Hiển thị store status (active/inactive)
- [ ] Hiển thị last sync time

#### 2.3 Shopbase Integration
- [ ] Tạo Shopbase API client (`lib/integrations/shopbase.ts`)
- [ ] Implement authentication
- [ ] Implement rate limiting
- [ ] Tạo test connection function
- [ ] Test với Shopbase store thật

#### 2.4 WooCommerce Integration
- [ ] Tạo WooCommerce API client (`lib/integrations/woocommerce.ts`)
- [ ] Implement OAuth/Basic Auth
- [ ] Implement rate limiting
- [ ] Tạo test connection function
- [ ] Test với WooCommerce store thật

#### 2.5 Sync Status System
- [ ] Tạo SyncLog model và API
- [ ] Tạo sync status indicator component
- [ ] Hiển thị sync history
- [ ] Hiển thị error messages

### Deliverables
✅ Users có thể add/edit/delete stores  
✅ API credentials được mã hóa an toàn  
✅ Test connection hoạt động cho cả Shopbase và WooCommerce  
✅ Sync status tracking

### Testing
```bash
# Test store CRUD
curl -X POST http://localhost:3000/api/stores \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Store","platform":"shopbase",...}'

# Test connection
curl -X POST http://localhost:3000/api/stores/{id}/test
```

---

## PHASE 3: Product & Order Sync (Tuần 3-4)

### Mục Tiêu
Đồng bộ products và orders từ các cửa hàng đã kết nối

### Tasks

#### 3.1 Product Sync - Shopbase
- [ ] Implement product sync logic
- [ ] Map Shopbase product data to Product model
- [ ] Handle product variants
- [ ] Implement incremental sync
- [ ] Handle errors và retries

#### 3.2 Product Sync - WooCommerce
- [ ] Implement product sync logic
- [ ] Map WooCommerce product data to Product model
- [ ] Handle product variations
- [ ] Implement incremental sync
- [ ] Handle errors và retries

#### 3.3 Product Management UI
- [ ] Tạo products list page
- [ ] Implement search và filter
- [ ] Tạo product detail view
- [ ] Tạo cost management UI (single edit)
- [ ] Tạo bulk cost update UI (CSV import)
- [ ] Hiển thị sync status per product

#### 3.4 Order Sync - Shopbase
- [ ] Implement order sync logic
- [ ] Map Shopbase order data to Order model
- [ ] Sync order line items
- [ ] Extract customer info
- [ ] Extract UTM parameters
- [ ] Handle refunds
- [ ] Implement incremental sync

#### 3.5 Order Sync - WooCommerce
- [ ] Implement order sync logic
- [ ] Map WooCommerce order data to Order model
- [ ] Sync order line items
- [ ] Extract customer info
- [ ] Handle refunds
- [ ] Implement incremental sync

#### 3.6 Order Management UI
- [ ] Tạo orders list page
- [ ] Implement pagination
- [ ] Implement filters (date, status, store)
- [ ] Tạo order detail view
- [ ] Hiển thị order items
- [ ] Export orders to CSV

#### 3.7 Sync Automation
- [ ] Tạo manual sync trigger buttons
- [ ] Implement background sync job (node-cron)
- [ ] Tạo sync queue system
- [ ] Implement rate limiting
- [ ] Implement retry logic với exponential backoff
- [ ] Update sync status real-time

#### 3.8 Sync Dashboard
- [ ] Tạo sync status dashboard
- [ ] Hiển thị sync progress
- [ ] Hiển thị records processed/created/updated
- [ ] Hiển thị errors
- [ ] Tạo sync history timeline

### Deliverables
✅ Products synced từ tất cả stores  
✅ Orders synced với full details  
✅ Manual sync hoạt động  
✅ Auto sync chạy theo schedule  
✅ Users có thể set COGS cho từng SKU  
✅ Incremental sync hoạt động đúng

### Testing
```bash
# Test product sync
docker-compose exec app npm run sync:products -- --storeId=xxx

# Test order sync
docker-compose exec app npm run sync:orders -- --storeId=xxx

# Verify data
docker-compose exec postgres psql -U user -d pnl_dashboard \
  -c "SELECT COUNT(*) FROM \"Product\";"
docker-compose exec postgres psql -U user -d pnl_dashboard \
  -c "SELECT COUNT(*) FROM \"Order\";"
```

---

## PHASE 4: Payment Gateway & Ads Cost (Tuần 5)

### Mục Tiêu
Cấu hình phí thanh toán và import chi phí quảng cáo

### Tasks

#### 4.1 Payment Gateway Settings
- [ ] Tạo PaymentGateway model và API
- [ ] Seed default gateways (Stripe, PayPal, Square, etc.)
- [ ] Tạo gateway settings UI
- [ ] Implement add/edit/delete gateway
- [ ] Tạo fee configuration form (% + fixed)
- [ ] Implement transaction fee calculation logic

#### 4.2 Ads Cost Model & API
- [ ] Tạo AdsCost model và API
- [ ] Implement CRUD endpoints
- [ ] Implement date range queries
- [ ] Implement aggregation queries

#### 4.3 Facebook Ads Parser
- [ ] Tạo Facebook Ads CSV parser
- [ ] Map columns to AdsCost fields
- [ ] Handle different export formats
- [ ] Validate data
- [ ] Test với real Facebook Ads exports

#### 4.4 Google Ads Parser
- [ ] Tạo Google Ads CSV parser
- [ ] Map columns to AdsCost fields
- [ ] Handle different export formats
- [ ] Validate data
- [ ] Test với real Google Ads exports

#### 4.5 Ads Import UI
- [ ] Tạo ads import page
- [ ] Implement file upload (CSV/Excel)
- [ ] Tạo column mapping interface
- [ ] Preview imported data
- [ ] Implement import confirmation
- [ ] Show import results

#### 4.6 Ads Management UI
- [ ] Tạo ads cost list page
- [ ] Implement filters (date, store, platform)
- [ ] Tạo manual entry form
- [ ] Tạo edit form
- [ ] Implement delete confirmation
- [ ] Show daily/monthly aggregations

#### 4.7 Ads Cost Allocation
- [ ] Implement equal split allocation
- [ ] Implement revenue-weighted allocation
- [ ] Make allocation method configurable
- [ ] Test both methods

### Deliverables
✅ Payment gateway fees configured  
✅ Transaction fees calculated per order  
✅ Ads costs imported từ Facebook/Google CSV  
✅ Manual ad entry hoạt động  
✅ Ads cost allocation logic implemented

### Testing
```bash
# Test gateway fee calculation
# Order total: $100
# Gateway: Stripe (2.9% + $0.30)
# Expected fee: $3.20

# Test ads import
# Upload Facebook Ads CSV
# Verify data imported correctly

# Test allocation
# Daily ad spend: $100
# 10 orders that day
# Equal split: $10 per order
# Revenue-weighted: varies by order value
```

---

## PHASE 5: P&L Calculation Engine (Tuần 6)

### Mục Tiêu
Tính toán các chỉ số lợi nhuận cho tất cả orders

### Tasks

#### 5.1 P&L Calculator Service
- [ ] Tạo `lib/calculations/pnl-calculator.ts`
- [ ] Implement COGS calculation
- [ ] Implement transaction fee calculation
- [ ] Implement ads cost allocation
- [ ] Implement gross profit calculation
- [ ] Implement net profit calculation
- [ ] Implement profit margin calculation
- [ ] Implement ROAS calculation
- [ ] Write unit tests

#### 5.2 P&L Calculation API
- [ ] Tạo `/api/pnl/calculate` endpoint
- [ ] Implement single order calculation
- [ ] Implement batch calculation
- [ ] Implement recalculation for date range
- [ ] Handle missing data (COGS, ads cost)

#### 5.3 Automated Calculation
- [ ] Calculate P&L during order sync
- [ ] Recalculate when product costs change
- [ ] Recalculate when ads costs imported
- [ ] Recalculate when gateway fees change
- [ ] Update cached values in Order table

#### 5.4 Aggregation Queries
- [ ] Implement daily aggregation
- [ ] Implement store-level aggregation
- [ ] Implement SKU-level aggregation
- [ ] Implement country-level aggregation
- [ ] Implement UTM-level aggregation
- [ ] Optimize queries với indexes

#### 5.5 P&L API Endpoints
- [ ] `/api/pnl/overview` - Dashboard KPIs
- [ ] `/api/pnl/daily` - Daily breakdown
- [ ] `/api/pnl/by-store` - Store comparison
- [ ] `/api/pnl/by-sku` - SKU profitability
- [ ] `/api/pnl/by-country` - Country breakdown
- [ ] `/api/pnl/by-utm` - UTM source breakdown
- [ ] `/api/pnl/alerts` - Negative ROI days

### Deliverables
✅ P&L metrics calculated cho tất cả orders  
✅ Cached calculations trong database  
✅ Recalculation on-demand  
✅ Aggregation APIs ready  
✅ Unit tests passed

### Testing
```bash
# Test P&L calculation
npm run test:pnl

# Test single order
curl http://localhost:3000/api/pnl/calculate?orderId=xxx

# Test aggregation
curl http://localhost:3000/api/pnl/overview?from=2024-01-01&to=2024-01-31

# Verify calculations manually
# Order: $100 revenue
# COGS: $40
# Transaction fee: $3
# Ads cost: $10
# Expected net profit: $47
# Expected margin: 47%
```

---

## PHASE 6: Dashboard & Reporting UI (Tuần 7-8)

### Mục Tiêu
Xây dựng dashboard với charts và insights

### Tasks

#### 6.1 Dashboard Overview Page
- [ ] Tạo dashboard layout
- [ ] Implement date range picker
- [ ] Implement store filter
- [ ] Create KPI cards:
  - [ ] Total Revenue
  - [ ] Net Profit
  - [ ] Profit Margin %
  - [ ] ROAS
  - [ ] Total Orders
  - [ ] AOV
  - [ ] Total COGS
- [ ] Add loading states
- [ ] Add error handling

#### 6.2 Charts Implementation
- [ ] Revenue vs Profit chart (Recharts combo)
  - [ ] Bar chart cho revenue
  - [ ] Line chart cho profit
  - [ ] Tooltip với details
  - [ ] Responsive design
- [ ] Ads Spend & ROAS trend chart
  - [ ] Dual axis chart
  - [ ] Daily breakdown
  - [ ] Highlight low ROAS days
- [ ] Store comparison chart
  - [ ] Horizontal bar chart
  - [ ] Sort by profit
  - [ ] Color coding
- [ ] Revenue by UTM source
  - [ ] Pie chart hoặc bar chart
  - [ ] Show top 10 sources
  - [ ] "Others" category
- [ ] Revenue by country
  - [ ] Bar chart
  - [ ] Show top 10 countries
  - [ ] Flag icons

#### 6.3 Daily Detailed View
- [ ] Tạo daily report page
- [ ] Show orders per day
- [ ] Drilldown by store
- [ ] Show P&L breakdown
- [ ] Export to CSV

#### 6.4 SKU Report
- [ ] Tạo SKU profitability page
- [ ] List all SKUs với profit metrics
- [ ] Sort by profit/margin/quantity
- [ ] Filter by store
- [ ] Highlight loss-making SKUs
- [ ] Export to CSV

#### 6.5 Store Report
- [ ] Tạo store comparison page
- [ ] Show P&L per store
- [ ] Trend charts per store
- [ ] Performance metrics
- [ ] Export to CSV

#### 6.6 Alerts & Insights
- [ ] Tạo alerts page
- [ ] Flag days với negative ROI
- [ ] Flag days với ROAS < threshold
- [ ] Flag missing COGS
- [ ] Flag unusual spikes/drops
- [ ] Configurable thresholds

#### 6.7 Responsive Design
- [ ] Test trên mobile devices
- [ ] Optimize charts cho mobile
- [ ] Collapsible sidebar
- [ ] Touch-friendly controls

#### 6.8 Export Functionality
- [ ] Export dashboard data to CSV
- [ ] Export charts as images
- [ ] Export reports to PDF (optional)

### Deliverables
✅ Fully functional dashboard với tất cả charts  
✅ Multiple report views  
✅ Alerts và insights  
✅ Mobile-responsive UI  
✅ Export functionality

### Testing
```bash
# Visual testing
# - Load dashboard với different date ranges
# - Test all filters
# - Test all charts
# - Test responsive design
# - Test export functions

# Performance testing
# - Load time < 2s
# - Charts render smoothly
# - No memory leaks
```

---

## PHASE 7: Settings & Optimization (Tuần 9)

### Mục Tiêu
Fine-tune settings và optimize performance

### Tasks

#### 7.1 App Settings
- [ ] Tạo AppSetting model và API
- [ ] Tạo settings page UI
- [ ] Implement settings:
  - [ ] Auto-sync interval
  - [ ] ROAS threshold for alerts
  - [ ] Ads cost allocation method
  - [ ] Default currency
  - [ ] Timezone
- [ ] Save/load settings
- [ ] Validate settings

#### 7.2 User Profile Settings
- [ ] Tạo profile page
- [ ] Update user info (name, email)
- [ ] Change password
- [ ] Upload avatar (optional)
- [ ] Delete account

#### 7.3 Database Optimization
- [ ] Review và optimize indexes
- [ ] Analyze slow queries
- [ ] Implement query caching
- [ ] Optimize aggregation queries
- [ ] Add database connection pooling

#### 7.4 Caching Layer
- [ ] Setup Redis (optional)
- [ ] Cache dashboard KPIs
- [ ] Cache aggregation results
- [ ] Implement cache invalidation
- [ ] Set TTL appropriately

#### 7.5 Performance Optimization
- [ ] Implement lazy loading
- [ ] Optimize images
- [ ] Code splitting
- [ ] Bundle size optimization
- [ ] Lighthouse audit và improvements

#### 7.6 UX Improvements
- [ ] Add loading skeletons
- [ ] Add toast notifications
- [ ] Implement error boundaries
- [ ] Add empty states
- [ ] Add tooltips và help text
- [ ] Improve form validation messages

#### 7.7 Error Handling
- [ ] Centralized error handling
- [ ] User-friendly error messages
- [ ] Error logging
- [ ] Retry mechanisms
- [ ] Fallback UI

### Deliverables
✅ Configurable app settings  
✅ Optimized database queries  
✅ Caching implemented  
✅ Better UX với loading states  
✅ Comprehensive error handling

### Testing
```bash
# Performance testing
npm run lighthouse

# Load testing
npm run test:load

# Check bundle size
npm run analyze

# Database query analysis
docker-compose exec postgres psql -U user -d pnl_dashboard \
  -c "EXPLAIN ANALYZE SELECT ..."
```

---

## PHASE 8: Testing & Deployment (Tuần 10)

### Mục Tiêu
Test kỹ lưỡng và deploy lên production

### Tasks

#### 8.1 Unit Tests
- [ ] Write tests cho P&L calculations
- [ ] Write tests cho encryption/decryption
- [ ] Write tests cho parsers
- [ ] Write tests cho utilities
- [ ] Achieve >80% code coverage

#### 8.2 Integration Tests
- [ ] Test API endpoints
- [ ] Test database operations
- [ ] Test sync logic
- [ ] Test authentication flow
- [ ] Test authorization

#### 8.3 E2E Tests
- [ ] Test critical user flows:
  - [ ] Register → Login → Add store → Sync → View dashboard
  - [ ] Import ads cost → Recalculate P&L
  - [ ] Update product costs → Verify calculations
  - [ ] Generate reports → Export CSV
- [ ] Use Playwright hoặc Cypress

#### 8.4 Security Audit
- [ ] Review API security
- [ ] Test authentication/authorization
- [ ] Check for SQL injection vulnerabilities
- [ ] Check for XSS vulnerabilities
- [ ] Review CORS settings
- [ ] Review rate limiting
- [ ] Scan dependencies for vulnerabilities

#### 8.5 Production Database Setup
- [ ] Choose hosting (Railway/Supabase/Neon)
- [ ] Create production database
- [ ] Run migrations
- [ ] Setup backups
- [ ] Configure connection pooling

#### 8.6 Production Deployment
- [ ] Build production Docker images
- [ ] Push images to registry (Docker Hub/GHCR)
- [ ] Setup production server
- [ ] Configure environment variables
- [ ] Deploy containers
- [ ] Setup reverse proxy (Nginx)
- [ ] Configure SSL/TLS
- [ ] Setup domain

#### 8.7 Monitoring & Logging
- [ ] Setup error tracking (Sentry - optional)
- [ ] Setup application monitoring
- [ ] Setup database monitoring
- [ ] Configure log aggregation
- [ ] Setup alerts

#### 8.8 Documentation
- [ ] Update README với deployment instructions
- [ ] Write API documentation
- [ ] Write user guide
- [ ] Document environment variables
- [ ] Document backup/restore procedures

#### 8.9 Final Testing
- [ ] Test production deployment
- [ ] Test với real stores
- [ ] Load testing
- [ ] Security testing
- [ ] User acceptance testing

### Deliverables
✅ All tests passing  
✅ Production deployment successful  
✅ Monitoring in place  
✅ Documentation complete  
✅ Application ready for users

### Testing
```bash
# Run all tests
npm run test
npm run test:e2e

# Security scan
npm audit
docker scan pnl-dashboard:latest

# Load testing
npm run test:load -- --users=100 --duration=5m

# Production smoke test
curl https://your-domain.com/api/health
```

---

## POST-LAUNCH: Maintenance & Enhancements

### Ongoing Tasks
- [ ] Monitor application performance
- [ ] Monitor error rates
- [ ] Review user feedback
- [ ] Fix bugs
- [ ] Security updates
- [ ] Dependency updates

### Future Enhancements (Backlog)
- [ ] Multi-currency support với conversion
- [ ] Profit forecasting và trends
- [ ] Email reports (weekly/monthly)
- [ ] Webhook support cho real-time sync
- [ ] Mobile app (React Native)
- [ ] Team collaboration (multi-user per store)
- [ ] Advanced analytics (cohort analysis, LTV)
- [ ] More platform integrations (Shopify, Amazon, Etsy)
- [ ] AI-powered insights và recommendations
- [ ] Custom dashboard widgets
- [ ] API for third-party integrations
- [ ] White-label solution

---

## TIMELINE SUMMARY

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1 | 1 tuần | Foundation, Auth, Docker setup |
| Phase 2 | 1 tuần | Store management, API integration |
| Phase 3 | 2 tuần | Product & Order sync |
| Phase 4 | 1 tuần | Payment gateway, Ads cost |
| Phase 5 | 1 tuần | P&L calculation engine |
| Phase 6 | 2 tuần | Dashboard & Reporting UI |
| Phase 7 | 1 tuần | Settings & Optimization |
| Phase 8 | 1 tuần | Testing & Deployment |
| **Total** | **10 tuần** | **Production-ready application** |

---

## DEPENDENCIES & RISKS

### Critical Dependencies
- Shopbase API access
- WooCommerce API access
- PostgreSQL database
- Docker environment

### Potential Risks
1. **API Rate Limits**: Shopbase/WooCommerce có thể limit requests
   - Mitigation: Implement rate limiting và retry logic

2. **Large Data Volume**: Stores với nhiều orders có thể slow
   - Mitigation: Pagination, incremental sync, caching

3. **API Changes**: Platforms có thể thay đổi API
   - Mitigation: Version API clients, monitor changes

4. **Data Accuracy**: COGS có thể missing hoặc incorrect
   - Mitigation: Validation, warnings, manual override

5. **Performance**: Dashboard có thể slow với nhiều data
   - Mitigation: Caching, aggregation, optimization

---

## SUCCESS METRICS

### Technical Metrics
- [ ] API response time < 500ms (p95)
- [ ] Dashboard load time < 2s
- [ ] Sync success rate > 95%
- [ ] Test coverage > 80%
- [ ] Zero critical security vulnerabilities

### Business Metrics
- [ ] Users có thể connect stores successfully
- [ ] Orders synced accurately
- [ ] P&L calculations correct
- [ ] Dashboard provides actionable insights
- [ ] Users can make data-driven decisions

---

## NEXT STEPS

1. Review và approve roadmap
2. Setup development environment
3. Start Phase 1 implementation
4. Regular progress reviews (weekly)
5. Adjust timeline nếu cần

**Sẵn sàng bắt đầu Phase 1!** 🚀
