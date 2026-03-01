# StorePilot P&L Dashboard

StorePilot is a profit and loss dashboard for multi-store e-commerce teams. It helps track revenue, COGS, ad spend, fees, profit, and synchronization status across ShopBase and WooCommerce stores.

## Features

- Multi-store management for ShopBase and WooCommerce
- Order and product synchronization
- Ad cost imports and account mappings
- Profit and loss reporting by total, day, store, SKU, country, and UTM source
- Role-based access control for store members
- Registration, login, and admin user management
- CSV export and operational alerts

## Tech Stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui, Recharts
- Backend: Next.js App Router and API routes
- Database: PostgreSQL 16
- ORM: Prisma
- Cache: Redis
- Auth: NextAuth credentials flow
- Containers: Docker Compose
- i18n: `next-intl`

## Requirements

- Node.js 20+
- npm 10+
- Docker Desktop with Docker Compose
- Git

## Quick Start

### 1. Clone the repository

```bash
git clone <repository-url>
cd ecom-store-manager
```

### 2. Create local environment files

Copy the example environment file and adjust values if needed.

```bash
cp .env.example .env.local
cp .env.example .env
```

For local development with Docker services on the host machine, these values are the important ones:

```bash
DATABASE_URL="postgresql://pnl_user:pnl_password@localhost:5433/pnl_dashboard"
REDIS_URL="redis://localhost:6380"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="replace-with-a-random-secret"
ENCRYPTION_KEY="replace-with-a-64-char-hex-key"
CRON_SECRET="replace-with-a-random-secret"
NODE_ENV="development"
NEXT_TELEMETRY_DISABLED=1
```

Generate secrets if needed:

```bash
openssl rand -base64 32
openssl rand -hex 32
openssl rand -hex 24
```

## Local Development

### Option A: Run PostgreSQL and Redis with Docker, app with Node.js

This is the recommended local workflow.

```bash
docker compose up -d postgres redis
npm install
npx prisma migrate deploy
npx prisma generate
npm run dev
```

App URL: `http://localhost:3000`

Default local service ports:

- PostgreSQL: `localhost:5433`
- Redis: `localhost:6380`

Stop local services:

```bash
docker compose down
```

### Option B: Run the full development stack in Docker

```bash
docker compose up --build
```

Or detached mode:

```bash
docker compose up -d --build
```

View logs:

```bash
docker compose logs -f app
```

Stop services:

```bash
docker compose down
```

## Windows Notes

This repository includes Windows native optional dependencies in `package.json`, so a normal `npm install` should also install the required binaries for:

- Next.js SWC
- `@parcel/watcher`
- `@swc/core`
- Lightning CSS

If `npm install` was previously run with optional dependencies disabled, remove `node_modules` and reinstall normally:

```bash
npm install
```

## Database Workflow

Apply existing migrations:

```bash
npx prisma migrate deploy
```

Create a new migration during development:

```bash
npx prisma migrate dev --name your_migration_name
```

Generate Prisma client:

```bash
npx prisma generate
```

Open Prisma Studio:

```bash
npx prisma studio
```

Run the seed script:

```bash
npm run seed
```

## Tests

Run the local test suite:

```bash
npm test
```

Current tests use Node's test runner via `tsx`:

```bash
npm run test:local
```

## Production Compose

Prepare a production `.env` file first, then run:

```bash
docker compose -f docker-compose.prod.yml up -d
```

View logs:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

Stop production services:

```bash
docker compose -f docker-compose.prod.yml down
```

## Main Routes

Pages:

- `/login`
- `/register`
- `/dashboard`
- `/dashboard/stores`
- `/dashboard/products`
- `/dashboard/orders`
- `/dashboard/reports`
- `/dashboard/settings`
- `/dashboard/ads`
- `/dashboard/admin/users`

Important API routes:

- `GET /api/health`
- `POST /api/auth/register`
- `GET|POST /api/stores`
- `GET /api/pnl`
- `GET /api/orders`
- `GET /api/products`
- `GET /api/reports/daily`
- `GET /api/reports/store`
- `GET /api/reports/sku`
- `GET /api/reports/alerts`

## Project Structure

```text
ecom-store-manager/
|- app/                     # Next.js app routes and API routes
|- components/              # Shared UI and feature components
|- lib/                     # Auth, Prisma, permissions, calculations, utilities
|- prisma/                  # Prisma schema, migrations, seed script
|- public/                  # Static assets
|- tests/                   # Automated tests
|- docker-compose.yml       # Development services
|- docker-compose.test.yml  # Test environment
|- docker-compose.prod.yml  # Production environment
|- Dockerfile.dev           # Development image
`- Dockerfile.prod          # Production image
```

## First Login

The first successful registration becomes the `SUPER_ADMIN` user automatically. After that, public registration depends on the `allow_registration` application setting.

## Useful Commands

```bash
# Start only infra services
docker compose up -d postgres redis

# Start dev server
npm run dev

# Run tests
npm test

# Check Docker services
docker compose ps

# Tail app logs
docker compose logs -f app
```
