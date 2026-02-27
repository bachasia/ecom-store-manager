import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const PRODUCT_SYNC_INTERVAL_HOURS = 24 // sync products tối đa 1 lần / 24h

/**
 * GET /api/cron/sync
 * Bảo vệ bằng Authorization: Bearer <CRON_SECRET>
 *
 * Được gọi bởi scheduler mỗi 5 phút.
 * Với mỗi store có autoSyncEnabled=true:
 *   - Trigger sync orders nếu đến giờ (dựa trên autoSyncInterval)
 *   - Trigger sync products nếu chưa sync trong 24h
 */
export async function GET(req: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }

  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // ── Lấy stores có auto sync bật ──────────────────────────────────────────
  const stores = await prisma.store.findMany({
    where: { autoSyncEnabled: true, isActive: true },
    select: {
      id: true,
      name: true,
      platform: true,
      autoSyncInterval: true,
      lastOrderAutoSyncAt: true,
      lastProductAutoSyncAt: true,
      lastSyncStatus: true,
    },
  })

  if (stores.length === 0) {
    return NextResponse.json({ message: "No stores with auto sync enabled", triggered: [], skipped: [] })
  }

  const now = new Date()
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
  const headers = {
    "Content-Type": "application/json",
    // Dùng CRON_SECRET để authenticate internal calls
    "x-cron-internal": cronSecret,
  }

  const triggered: Array<{ storeId: string; name: string; type: string }> = []
  const skipped:   Array<{ storeId: string; name: string; reason: string }> = []

  for (const store of stores) {
    // Skip nếu đang sync để tránh overlap
    if (store.lastSyncStatus === "in_progress" || store.lastSyncStatus === "cancelling") {
      skipped.push({ storeId: store.id, name: store.name, reason: "already syncing" })
      continue
    }

    // ── Check orders ────────────────────────────────────────────────────────
    const orderIntervalMs = store.autoSyncInterval * 60 * 1000
    const lastOrderSync   = store.lastOrderAutoSyncAt?.getTime() ?? 0
    const shouldSyncOrders = (now.getTime() - lastOrderSync) >= orderIntervalMs

    if (shouldSyncOrders) {
      try {
        // Fire-and-forget — không await để không block các stores khác
        fetch(`${baseUrl}/api/sync/orders/${store.id}?auto=1`, {
          method: "POST",
          headers,
        }).catch((err) =>
          console.error(`[cron] orders sync error store=${store.id}:`, err.message)
        )

        // Cập nhật timestamp ngay để tránh trigger lại trước khi sync xong
        await prisma.store.update({
          where: { id: store.id },
          data: { lastOrderAutoSyncAt: now },
        })

        triggered.push({ storeId: store.id, name: store.name, type: "orders" })
        console.info(`[cron] triggered orders sync for store=${store.name} (${store.id})`)
      } catch (err: any) {
        console.error(`[cron] failed to trigger orders sync store=${store.id}:`, err.message)
        skipped.push({ storeId: store.id, name: store.name, reason: `orders trigger error: ${err.message}` })
      }
    }

    // ── Check products (chỉ ShopBase, tối đa 1 lần / 24h) ──────────────────
    if (store.platform === "shopbase") {
      const productIntervalMs = PRODUCT_SYNC_INTERVAL_HOURS * 60 * 60 * 1000
      const lastProductSync   = store.lastProductAutoSyncAt?.getTime() ?? 0
      const shouldSyncProducts = (now.getTime() - lastProductSync) >= productIntervalMs

      if (shouldSyncProducts) {
        try {
          fetch(`${baseUrl}/api/sync/products/${store.id}`, {
            method: "POST",
            headers,
          }).catch((err) =>
            console.error(`[cron] products sync error store=${store.id}:`, err.message)
          )

          await prisma.store.update({
            where: { id: store.id },
            data: { lastProductAutoSyncAt: now },
          })

          triggered.push({ storeId: store.id, name: store.name, type: "products" })
          console.info(`[cron] triggered products sync for store=${store.name} (${store.id})`)
        } catch (err: any) {
          console.error(`[cron] failed to trigger products sync store=${store.id}:`, err.message)
          skipped.push({ storeId: store.id, name: store.name, reason: `products trigger error: ${err.message}` })
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    checkedAt: now.toISOString(),
    stores: stores.length,
    triggered,
    skipped,
  })
}
