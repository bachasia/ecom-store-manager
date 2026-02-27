/**
 * Next.js instrumentation hook — chạy một lần khi server khởi động.
 * Dùng để khởi động cron scheduler cho auto sync.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Chỉ chạy trong Node.js runtime (không chạy trong Edge runtime hay client)
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  // Chỉ chạy trong production để tránh nhiễu khi dev hot-reload
  if (process.env.NODE_ENV !== "production") return

  const { startCronScheduler } = await import("@/lib/cron/scheduler")
  startCronScheduler()
}
