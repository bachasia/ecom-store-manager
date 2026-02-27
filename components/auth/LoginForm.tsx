"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ArrowRight, BarChart3, LockKeyhole, Mail, ShieldCheck } from "lucide-react"

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

  const noticeCards = [
    {
      icon: <BarChart3 className="h-4 w-4 text-indigo-600" />,
      title: "Unified P&L",
      text: "Track revenue, costs, ROAS, and margin in one place.",
    },
    {
      icon: <ShieldCheck className="h-4 w-4 text-emerald-600" />,
      title: "Store-level control",
      text: "Review orders, ads, alerts, and reports with protected access.",
    },
  ]

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-indigo-50/60">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-[0_24px_80px_-32px_rgba(79,70,229,0.35)] lg:grid-cols-[1.08fr_0.92fr]">
          <div className="relative hidden overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-900 to-indigo-700 p-10 text-white lg:block">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(129,140,248,0.22),transparent_30%)]" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="space-y-8">
                <div className="inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-400 shadow-lg shadow-indigo-950/30">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-indigo-100/80">Ecom analytics</p>
                    <p className="text-base font-semibold">P&amp;L Dashboard</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-sm font-medium uppercase tracking-[0.3em] text-indigo-200/80">Welcome back</p>
                  <h1 className="max-w-lg text-4xl font-bold tracking-tight text-white">
                    Sign in to manage orders, ads, and detailed profitability reports.
                  </h1>
                  <p className="max-w-xl text-sm leading-7 text-indigo-100/80">
                    Stay aligned with the same clean workspace used inside the dashboard, with fast access to reports,
                    alerting, and store performance insights.
                  </p>
                </div>

                <div className="grid gap-4">
                  {noticeCards.map((card) => (
                    <div key={card.title} className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/90">
                        {card.icon}
                      </div>
                      <p className="text-sm font-semibold text-white">{card.title}</p>
                      <p className="mt-1 text-sm leading-6 text-indigo-100/75">{card.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-10 rounded-2xl border border-white/10 bg-black/10 px-5 py-4 text-sm text-indigo-100/80 backdrop-blur-sm">
                Secure sign-in keeps each store workspace private and synced with your active locale.
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center p-6 sm:p-8 lg:p-10">
            <div className="w-full max-w-md space-y-6">
              <div className="space-y-3 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
                  <LockKeyhole className="h-3.5 w-3.5" />
                  Secure access
                </div>
                <div>
                  <h2 className="text-3xl font-bold tracking-tight text-gray-900">{t("login")}</h2>
                  <p className="mt-2 text-sm text-gray-500">
                    {t("or")}{" "}
                    <Link href={`${localePrefix}/register`} className="font-semibold text-indigo-600 hover:text-indigo-500">
                      {t("registerLink")}
                    </Link>
                  </p>
                </div>
              </div>

              {showProtectedNotice && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
                  <p className="text-sm font-medium text-amber-800">{t("signInToContinue")}</p>
                </div>
              )}

              {showRegisteredNotice && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm">
                  <p className="text-sm font-medium text-emerald-800">{t("registrationSuccess")}</p>
                </div>
              )}

              <form className="space-y-5" onSubmit={handleSubmit}>
                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 shadow-sm">
                    <p className="text-sm font-medium text-red-800">{error}</p>
                  </div>
                )}

                <div className="space-y-4 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
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
                        className="block h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
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
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="block h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
                        placeholder={t("password")}
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? t("loggingIn") : t("loginButton")}
                  {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
