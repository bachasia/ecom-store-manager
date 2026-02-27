import { getServerSession } from "next-auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth/options"

export default async function Home() {
  const session = await getServerSession(authOptions)
  const requestHeaders = await headers()
  const locale = requestHeaders.get("x-locale") === "vi" ? "vi" : "en"
  const localePrefix = locale === "vi" ? "/vi" : ""

  if (!session) {
    redirect(`${localePrefix}/login?callbackUrl=${encodeURIComponent(`${localePrefix}/dashboard`)}&reason=auth_required`)
  }

  redirect(`${localePrefix}/dashboard`)
}
