"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useTranslations } from "next-intl"

export default function LoginForm({
  showProtectedNotice = false,
  showRegisteredNotice = false,
}: {
  showProtectedNotice?: boolean
  showRegisteredNotice?: boolean
}) {
  const t = useTranslations("auth")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const isViPath = pathname === "/vi/login" || pathname.startsWith("/vi/")
  const localePrefix = isViPath ? "/vi" : ""
  const fallbackDashboard = `${localePrefix}/dashboard`
  const callbackUrl = searchParams.get("callbackUrl") || fallbackDashboard

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      })

      if (result?.error) {
        setError(t("invalidCredentials"))
      } else {
        router.push(result?.url || callbackUrl)
        router.refresh()
      }
    } catch {
      setError(t("loginError"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            {t("login")}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {t("or")}{" "}
            <Link href={`${localePrefix}/register`} className="font-medium text-blue-600 hover:text-blue-500">
              {t("registerLink")}
            </Link>
          </p>
        </div>

        {showProtectedNotice && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800">{t("signInToContinue")}</p>
          </div>
        )}

        {showRegisteredNotice && (
          <div className="rounded-md border border-green-200 bg-green-50 p-4">
            <p className="text-sm text-green-800">{t("registrationSuccess")}</p>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          <div className="-space-y-px rounded-md shadow-sm">
            <div>
              <label htmlFor="email" className="sr-only">
                {t("email")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="relative block w-full rounded-t-md border-0 px-3 py-2 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                placeholder={t("email")}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                {t("password")}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="relative block w-full rounded-b-md border-0 px-3 py-2 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                placeholder={t("password")}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
            >
              {loading ? t("loggingIn") : t("loginButton")}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
