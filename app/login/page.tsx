import { getServerSession } from "next-auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import LoginForm from "@/components/auth/LoginForm"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; reason?: string; registered?: string }>
}) {
  const session = await getServerSession(authOptions)
  const requestHeaders = await headers()
  const locale = requestHeaders.get("x-locale") === "vi" ? "vi" : "en"
  const localePrefix = locale === "vi" ? "/vi" : ""
  const resolvedSearchParams = await searchParams

  if (session) {
    redirect(`${localePrefix}/dashboard`)
  }

  return (
    <LoginForm
      showProtectedNotice={resolvedSearchParams.reason === "auth_required"}
      showRegisteredNotice={resolvedSearchParams.registered === "true"}
    />
  )
}
