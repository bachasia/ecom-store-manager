"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ArrowRight, BarChart3, LockKeyhole, Mail, UserRound } from "lucide-react"

export default function RegisterForm() {
  const t = useTranslations("auth")
  const router = useRouter()
  const pathname = usePathname()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const isViPath = pathname === "/vi/register" || pathname.startsWith("/vi/")
  const localePrefix = isViPath ? "/vi" : ""

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || t("registerError"))
        return
      }

      router.push(`${localePrefix}/login?registered=true`)
    } catch {
      setError(t("registerError"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(160deg,#f5f7ff_0%,#eef6ff_45%,#f8fafc_100%)] px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(59,130,246,0.14),transparent_35%),radial-gradient(circle_at_85%_10%,rgba(14,116,144,0.16),transparent_30%)]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
        <div className="w-full rounded-3xl border border-gray-200/80 bg-white/90 p-6 shadow-[0_24px_80px_-40px_rgba(79,70,229,0.45)] backdrop-blur sm:p-8">
          <div className="mb-6 space-y-4">
            <div className="inline-flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-500 text-white">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-700">DTC Suite</p>
                <p className="text-sm font-semibold text-gray-900">DTC StorePilot</p>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t("register")}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {t("or")}{" "}
                <Link href={`${localePrefix}/login`} className="font-semibold text-indigo-600 hover:text-indigo-500">
                  {t("loginLink")}
                </Link>
              </p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium text-gray-700">
                {t("name")}
              </label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                  placeholder={t("namePlaceholder")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-gray-700">
                {t("email")}
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                  placeholder={t("email")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-gray-700">
                {t("password")}
              </label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                  placeholder={t("passwordMin")}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? t("registering") : t("registerButton")}
              {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
