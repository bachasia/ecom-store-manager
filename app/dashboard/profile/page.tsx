"use client"

import { useState, useEffect } from "react"
import { signOut } from "next-auth/react"
import { useTranslations } from "next-intl"
import { usePathname } from "next/navigation"
import { User, Mail, Lock, Save, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string
  name: string | null
  email: string
  createdAt: string
  systemRole: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({ title, description, children }: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <p className="mt-0.5 text-sm text-gray-500">{description}</p>
      </div>
      <div className="px-6 py-6">{children}</div>
    </div>
  )
}

function Alert({ type, message }: { type: "success" | "error"; message: string }) {
  return (
    <div className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium ${
      type === "success"
        ? "bg-green-50 border border-green-100 text-green-700"
        : "bg-red-50 border border-red-100 text-red-700"
    }`}>
      {type === "success"
        ? <CheckCircle className="w-4 h-4 shrink-0" />
        : <AlertCircle className="w-4 h-4 shrink-0" />
      }
      {message}
    </div>
  )
}

function PasswordInput({ value, onChange, placeholder, autoComplete }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="block w-full rounded-xl border border-gray-200 px-3 py-2.5 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const t = useTranslations("profile")
  const pathname = usePathname()
  const isVi = pathname.startsWith("/vi")
  const localePrefix = isVi ? "/vi" : ""

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading]   = useState(true)

  // Name / Email form
  const [name, setName]   = useState("")
  const [email, setEmail] = useState("")
  const [infoSaving, setInfoSaving]   = useState(false)
  const [infoAlert, setInfoAlert]     = useState<{ type: "success" | "error"; message: string } | null>(null)

  // Password form
  const [currentPassword, setCurrentPassword]   = useState("")
  const [newPassword, setNewPassword]           = useState("")
  const [confirmPassword, setConfirmPassword]   = useState("")
  const [passSaving, setPassSaving]             = useState(false)
  const [passAlert, setPassAlert]               = useState<{ type: "success" | "error"; message: string } | null>(null)

  useEffect(() => {
    fetch("/api/profile")
      .then(r => r.json())
      .then(data => {
        if (data.user) {
          setProfile(data.user)
          setName(data.user.name ?? "")
          setEmail(data.user.email)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  // Map API error codes → i18n keys
  const apiErrorKey = (code: string) => {
    const map: Record<string, string> = {
      nameTooShort:          "errorNameTooShort",
      emailInvalid:          "errorEmailInvalid",
      emailInUse:            "errorEmailInUse",
      noChanges:             "errorNoChanges",
      currentPasswordRequired: "errorCurrentPasswordRequired",
      currentPasswordWrong:  "errorCurrentPasswordWrong",
      passwordTooShort:      "errorPasswordTooShort",
    }
    return map[code] ?? "errorGeneric"
  }

  const handleInfoSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setInfoAlert(null)
    setInfoSaving(true)
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null, email: email.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setProfile(prev => prev ? { ...prev, name: data.user.name, email: data.user.email } : prev)
        setInfoAlert({ type: "success", message: t("infoSaved") })
        // Email changed → force re-login so JWT gets refreshed
        if (data.user.email !== profile?.email) {
          setTimeout(() => signOut({ callbackUrl: `${localePrefix}/login` }), 1500)
        }
      } else {
        setInfoAlert({ type: "error", message: t(apiErrorKey(data.error)) })
      }
    } catch {
      setInfoAlert({ type: "error", message: t("errorGeneric") })
    } finally {
      setInfoSaving(false)
    }
  }

  const handlePassSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setPassAlert(null)
    if (newPassword !== confirmPassword) {
      setPassAlert({ type: "error", message: t("errorPasswordMismatch") })
      return
    }
    setPassSaving(true)
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (res.ok) {
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
        setPassAlert({ type: "success", message: t("passSaved") })
      } else {
        setPassAlert({ type: "error", message: t(apiErrorKey(data.error)) })
      }
    } catch {
      setPassAlert({ type: "error", message: t("errorGeneric") })
    } finally {
      setPassSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  const initials = (name || email).charAt(0).toUpperCase()
  const roleLabel = profile?.systemRole === "SUPER_ADMIN" ? "Super Admin" : "User"
  const roleCls   = profile?.systemRole === "SUPER_ADMIN"
    ? "bg-purple-100 text-purple-700"
    : "bg-gray-100 text-gray-600"
  const joinedDate = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(isVi ? "vi-VN" : "en-US", {
        year: "numeric", month: "long", day: "numeric",
      })
    : ""

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">{t("title")}</h2>
        <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>
      </div>

      {/* Avatar card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-5 flex items-center gap-5">
        <div className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-indigo-500 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
          <span className="text-white text-2xl font-bold">{initials}</span>
        </div>
        <div className="min-w-0">
          <p className="text-lg font-semibold text-gray-900 truncate">
            {profile?.name || email.split("@")[0]}
          </p>
          <p className="text-sm text-gray-500 truncate">{profile?.email}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${roleCls}`}>
              {roleLabel}
            </span>
            {joinedDate && (
              <span className="text-xs text-gray-400">{t("joinedOn", { date: joinedDate })}</span>
            )}
          </div>
        </div>
      </div>

      {/* Info Section */}
      <Section title={t("infoTitle")} description={t("infoDesc")}>
        <form onSubmit={handleInfoSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              <User className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              {t("nameLabel")}
              <span className="normal-case font-normal text-gray-400 ml-1">({t("optional")})</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              autoComplete="name"
              className="block w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              <Mail className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              {t("emailLabel")}
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="block w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
            <p className="mt-1.5 text-xs text-gray-400">{t("emailChangeHint")}</p>
          </div>

          {infoAlert && <Alert type={infoAlert.type} message={infoAlert.message} />}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={infoSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white shadow-sm hover:shadow-md disabled:opacity-60 transition-all"
            >
              <Save className="w-4 h-4" />
              {infoSaving ? t("saving") : t("saveInfo")}
            </button>
          </div>
        </form>
      </Section>

      {/* Password Section */}
      <Section title={t("passTitle")} description={t("passDesc")}>
        <form onSubmit={handlePassSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              <Lock className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              {t("currentPassword")}
            </label>
            <PasswordInput
              value={currentPassword}
              onChange={setCurrentPassword}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                {t("newPassword")}
              </label>
              <PasswordInput
                value={newPassword}
                onChange={setNewPassword}
                placeholder={t("newPasswordPlaceholder")}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                {t("confirmPassword")}
              </label>
              <PasswordInput
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder={t("confirmPasswordPlaceholder")}
                autoComplete="new-password"
              />
            </div>
          </div>
          <p className="text-xs text-gray-400">{t("passwordHint")}</p>

          {passAlert && <Alert type={passAlert.type} message={passAlert.message} />}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={passSaving || !currentPassword || !newPassword || !confirmPassword}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white shadow-sm hover:shadow-md disabled:opacity-60 transition-all"
            >
              <Lock className="w-4 h-4" />
              {passSaving ? t("saving") : t("savePassword")}
            </button>
          </div>
        </form>
      </Section>
    </div>
  )
}
