# Hướng dẫn Deploy StorePilot lên VPS

## Tổng quan kiến trúc

```
Internet → Nginx (80/443) → Next.js App (3000) → PostgreSQL + Redis
```

Tất cả chạy trong Docker. Image app được pull từ Docker Hub `bachasia/storepilot:latest`.

---

## PHẦN 1 — Build & Push Image lên Docker Hub

Thực hiện trên **máy dev**, mỗi lần có code mới.

### Bước 1: Đăng nhập Docker Hub

```bash
docker login
# Nhập username: bachasia
# Nhập password (hoặc Access Token từ hub.docker.com/settings/security)
```

### Bước 2: Build image cho production

```bash
cd /path/to/ecom-store-manager

# Build image với tag latest
docker build \
  -f Dockerfile.prod \
  -t bachasia/storepilot:latest \
  .
```

> Build lần đầu mất ~5-10 phút. Các lần sau nhanh hơn nhờ Docker cache.

**Build cho nhiều platform (nếu VPS dùng ARM, ví dụ Oracle Cloud):**

```bash
# Cài buildx nếu chưa có
docker buildx create --use

docker buildx build \
  -f Dockerfile.prod \
  --platform linux/amd64,linux/arm64 \
  -t bachasia/storepilot:latest \
  --push \
  .
```

### Bước 3: Push lên Docker Hub

```bash
# Nếu không dùng buildx --push ở trên:
docker push bachasia/storepilot:latest

# Tag thêm version cụ thể để rollback được
docker tag bachasia/storepilot:latest bachasia/storepilot:v1.0.0
docker push bachasia/storepilot:v1.0.0
```

### Kiểm tra image đã lên Hub

```bash
docker manifest inspect bachasia/storepilot:latest
```

---

## PHẦN 2 — Chuẩn bị VPS

### Yêu cầu tối thiểu
- Ubuntu 22.04 LTS (hoặc Debian 12)
- RAM: 2GB+ (khuyến nghị 4GB)
- CPU: 2 vCPU+
- Disk: 20GB+
- Port mở: 22 (SSH), 80 (HTTP), 443 (HTTPS)

### Bước 1: Cài Docker & Docker Compose

```bash
# SSH vào VPS
ssh root@your-vps-ip

# Cài Docker
curl -fsSL https://get.docker.com | sh

# Thêm user vào group docker (nếu không dùng root)
usermod -aG docker $USER

# Kiểm tra
docker --version
docker compose version
```

### Bước 2: Tạo thư mục làm việc

```bash
mkdir -p /opt/storepilot/{backups,ssl,logs}
cd /opt/storepilot
```

### Bước 3: Copy các file cần thiết lên VPS

Từ máy dev, copy các file sau:

```bash
# Chạy trên máy dev
scp docker-compose.prod.yml root@your-vps-ip:/opt/storepilot/
scp nginx.conf              root@your-vps-ip:/opt/storepilot/
scp .env.production.example root@your-vps-ip:/opt/storepilot/
```

---

## PHẦN 3 — Cấu hình môi trường trên VPS

### Bước 1: Tạo file .env

```bash
cd /opt/storepilot
cp .env.production.example .env
nano .env   # hoặc vim .env
```

Điền đầy đủ các giá trị:

```bash
# Generate NEXTAUTH_SECRET
openssl rand -base64 32

# Generate ENCRYPTION_KEY (bắt buộc đúng 64 hex chars)
openssl rand -hex 32

# Generate CRON_SECRET
openssl rand -hex 24
```

**Ví dụ file .env hoàn chỉnh:**

```env
DATABASE_URL="postgresql://storepilot:MyStr0ngP@ss@postgres:5432/storepilot"
POSTGRES_USER="storepilot"
POSTGRES_PASSWORD="MyStr0ngP@ss"
POSTGRES_DB="storepilot"

REDIS_PASSWORD="MyRedisP@ss123"

NEXTAUTH_URL="https://storepilot.yourdomain.com"
NEXTAUTH_SECRET="abc123....(output của openssl rand -base64 32)"

ENCRYPTION_KEY="96c4a10d....(output của openssl rand -hex 32)"

CRON_SECRET="f3e337....(output của openssl rand -hex 24)"
```

> **Quan trọng:** Sau khi set `ENCRYPTION_KEY`, KHÔNG ĐƯỢC thay đổi. Nếu thay đổi, mọi API key của store đã lưu sẽ không decrypt được.

### Bước 2: Phân quyền file .env

```bash
chmod 600 /opt/storepilot/.env
```

---

## PHẦN 4 — Cấu hình SSL (HTTPS)

### Tùy chọn A: Dùng Let's Encrypt (khuyến nghị)

```bash
# Cài certbot
apt install certbot -y

# Lấy certificate (tạm dừng nginx nếu đang chạy)
certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Certificate được lưu tại:
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/yourdomain.com/privkey.pem

# Copy vào thư mục ssl của project
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem /opt/storepilot/ssl/
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem   /opt/storepilot/ssl/
chmod 644 /opt/storepilot/ssl/fullchain.pem
chmod 600 /opt/storepilot/ssl/privkey.pem
```

### Tùy chọn B: Không dùng SSL (nội bộ / test)

Sửa `nginx.conf` — bỏ server HTTPS, chỉ giữ server port 80 không redirect.

### Cập nhật domain trong nginx.conf

```bash
nano /opt/storepilot/nginx.conf
# Thay "your-domain.com" bằng domain thật của bạn (2 chỗ)
```

---

## PHẦN 5 — Deploy lần đầu

```bash
cd /opt/storepilot

# Pull image mới nhất từ Docker Hub
docker pull bachasia/storepilot:latest

# Khởi động tất cả services
docker compose -f docker-compose.prod.yml up -d

# Theo dõi log
docker compose -f docker-compose.prod.yml logs -f app
```

### Kiểm tra trạng thái

```bash
# Xem tất cả containers
docker compose -f docker-compose.prod.yml ps

# Kết quả mong đợi:
# pnl-postgres-prod    running (healthy)
# pnl-redis-prod       running (healthy)
# pnl-app-prod         running (healthy)
# pnl-nginx-prod       running
```

### Kiểm tra health

```bash
curl http://localhost:3000/api/health
# {"status":"ok"}
```

---

## PHẦN 6 — Tạo tài khoản đầu tiên

Mở trình duyệt, vào `https://yourdomain.com/auth/register`.

Lần đầu (DB rỗng) → cho phép đăng ký bất kể setting.
Sau khi tạo xong → vào **Settings → Admin → tắt "Cho phép đăng ký"** để bảo mật.

---

## PHẦN 7 — Update code (deploy lại)

Mỗi khi có code mới, từ máy dev:

```bash
# 1. Build & push image mới
docker build -f Dockerfile.prod -t bachasia/storepilot:latest .
docker tag bachasia/storepilot:latest bachasia/storepilot:v1.x.x
docker push bachasia/storepilot:latest
docker push bachasia/storepilot:v1.x.x

# 2. SSH vào VPS, pull image mới và restart
ssh root@your-vps-ip
cd /opt/storepilot

docker compose -f docker-compose.prod.yml pull app
docker compose -f docker-compose.prod.yml up -d app
# App tự chạy prisma migrate deploy trước khi start

# 3. Xem log xác nhận
docker compose -f docker-compose.prod.yml logs -f app --tail=50
```

---

## PHẦN 8 — Backup Database

### Backup thủ công

```bash
cd /opt/storepilot

docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U $POSTGRES_USER $POSTGRES_DB \
  > backups/backup_$(date +%Y%m%d_%H%M%S).sql
```

### Backup tự động (cron)

```bash
crontab -e

# Thêm dòng sau — backup mỗi ngày lúc 3:00 AM, giữ 30 ngày
0 3 * * * cd /opt/storepilot && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U storepilot storepilot > backups/backup_$(date +\%Y\%m\%d).sql && find backups/ -name "*.sql" -mtime +30 -delete
```

### Restore từ backup

```bash
cat backups/backup_20260101.sql | docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U $POSTGRES_USER $POSTGRES_DB
```

---

## PHẦN 9 — Gia hạn SSL (Let's Encrypt)

```bash
# Chạy thủ công để test
certbot renew --dry-run

# Tự động gia hạn mỗi tháng (thêm vào cron)
0 0 1 * * certbot renew --quiet && \
  cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem /opt/storepilot/ssl/ && \
  cp /etc/letsencrypt/live/yourdomain.com/privkey.pem /opt/storepilot/ssl/ && \
  docker compose -f /opt/storepilot/docker-compose.prod.yml restart nginx
```

---

## Troubleshooting

### App không start được

```bash
# Xem log chi tiết
docker compose -f docker-compose.prod.yml logs app --tail=100

# Lỗi thường gặp:
# - ENCRYPTION_KEY không đủ 32 ký tự → generate lại
# - DATABASE_URL sai host → phải là "postgres" (tên service), không phải localhost
# - prisma migrate fail → kiểm tra DB có chạy không
```

### Reset hoàn toàn (xóa data)

```bash
docker compose -f docker-compose.prod.yml down -v
# Cảnh báo: -v xóa toàn bộ volume, mất data database!
```

### Xem resource usage

```bash
docker stats
```

---

## Checklist deploy lần đầu

- [ ] Docker đã cài trên VPS
- [ ] File `.env` đã tạo với đầy đủ giá trị thật
- [ ] `ENCRYPTION_KEY` đúng 64 hex chars (`openssl rand -hex 32`)
- [ ] `NEXTAUTH_URL` đúng domain thật (có `https://`)
- [ ] SSL certificate đã copy vào `/opt/storepilot/ssl/`
- [ ] `nginx.conf` đã sửa domain
- [ ] `docker compose up -d` thành công, tất cả container healthy
- [ ] Truy cập được `https://yourdomain.com`
- [ ] Đăng ký tài khoản đầu tiên thành công
- [ ] Tắt open registration trong Settings → Admin
- [ ] Cron backup đã setup
