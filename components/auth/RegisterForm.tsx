"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ArrowRight, BarChart3, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react"

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

  const benefitCards = [
    {
      icon: <BarChart3 className="h-4 w-4 text-indigo-600" />,
      title: "Live dashboards",
      text: "See revenue, fees, ad spend, and margin in one connected workflow.",
    },
    {
      icon: <ShieldCheck className="h-4 w-4 text-emerald-600" />,
      title: "Protected workspace",
      text: "Keep each store account secure with private auth and role-based access patterns.",
    },
  ]

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-indigo-50/60">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-[0_24px_80px_-32px_rgba(79,70,229,0.35)] lg:grid-cols-[1.08fr_0.92fr]">
          <div className="relative hidden overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-900 to-sky-700 p-10 text-white lg:block">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.20),transparent_30%)]" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="space-y-8">
                <div className="inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 shadow-lg shadow-indigo-950/30">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-sky-100/80">Set up workspace</p>
                    <p className="text-base font-semibold">P&amp;L Dashboard</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-sm font-medium uppercase tracking-[0.3em] text-sky-200/80">Create account</p>
                  <h1 className="max-w-lg text-4xl font-bold tracking-tight text-white">
                    Launch a cleaner workflow for orders, ads, and profitability insights.
                  </h1>
                  <p className="max-w-xl text-sm leading-7 text-indigo-100/80">
                    Start with the same interface language as the dashboard so your team can move from sign-up to store
                    analysis without a visual disconnect.
                  </p>
                </div>

                <div className="grid gap-4">
                  {benefitCards.map((card) => (
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
                New accounts are ready to plug into store sync, ROAS alerts, and detailed reporting flows.
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center p-6 sm:p-8 lg:p-10">
            <div className="w-full max-w-md space-y-6">
              <div className="space-y-3 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
                  <UserRound className="h-3.5 w-3.5" />
                  New workspace
                </div>
                <div>
                  <h2 className="text-3xl font-bold tracking-tight text-gray-900">{t("register")}</h2>
                  <p className="mt-2 text-sm text-gray-500">
                    {t("or")}{" "}
                    <Link href={`${localePrefix}/login`} className="font-semibold text-indigo-600 hover:text-indigo-500">
                      {t("loginLink")}
                    </Link>
                  </p>
                </div>
              </div>

              <form className="space-y-5" onSubmit={handleSubmit}>
                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 shadow-sm">
                    <p className="text-sm font-medium text-red-800">{error}</p>
                  </div>
                )}

                <div className="space-y-4 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
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
                        className="block h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
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
                        autoComplete="new-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="block h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
                        placeholder={t("passwordMin")}
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? t("registering") : t("registerButton")}
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
