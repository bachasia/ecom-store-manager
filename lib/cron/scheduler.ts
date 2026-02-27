import cron from "node-cron"

let started = false

/**
 * Khởi động cron scheduler.
 * Chạy mỗi 5 phút — check stores nào đến giờ sync và trigger /api/cron/sync.
 * Guard bằng `started` flag để tránh đăng ký nhiều lần khi hot-reload.
 */
export function startCronScheduler() {
  if (started) return
  started = true

  const cronSecret = process.env.CRON_SECRET
  const baseUrl    = process.env.NEXTAUTH_URL || "http://localhost:3000"

  if (!cronSecret) {
    console.warn("[cron] CRON_SECRET not set — auto sync scheduler disabled")
    return
  }

  // Chạy mỗi 5 phút: */5 * * * *
  cron.schedule("*/5 * * * *", async () => {
    try {
      const res = await fetch(`${baseUrl}/api/cron/sync`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
        },
      })

      if (!res.ok) {
        const text = await res.text()
        console.error(`[cron] /api/cron/sync responded ${res.status}: ${text}`)
        return
      }

      const data = await res.json()
      if (data.triggered?.length > 0) {
        console.info(
          `[cron] triggered syncs: ${data.triggered.map((t: any) => `${t.name}/${t.type}`).join(", ")}`
        )
      } else {
        console.info("[cron] no syncs due — all stores up to date")
      }
    } catch (err: any) {
      console.error("[cron] scheduler error:", err.message)
    }
  })

  console.info("[cron] auto sync scheduler started (every 5 minutes)")
}
