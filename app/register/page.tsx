import { getServerSession } from "next-auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import RegisterForm from "@/components/auth/RegisterForm"

export default async function RegisterPage() {
  const session = await getServerSession(authOptions)
  const requestHeaders = await headers()
  const locale = requestHeaders.get("x-locale") === "vi" ? "vi" : "en"
  const localePrefix = locale === "vi" ? "/vi" : ""

  if (session) {
    redirect(`${localePrefix}/dashboard`)
  }

  return <RegisterForm />
}
