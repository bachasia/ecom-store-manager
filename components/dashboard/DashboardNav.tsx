"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { signOut } from "next-auth/react"
import Link from "next/link"
import { useTranslations } from 'next-intl'
import LanguageSwitcher from "@/components/language-switcher"
import ExchangeRate from "@/components/ui/exchange-rate"
import { getAlertCount, getCurrentMonthToDateRange } from "@/lib/reports/helpers"
import { useIsSuperAdmin, useSystemRole } from "@/hooks/usePermissions"
import { type SystemRole } from "@/lib/roles"
import { 
  LayoutDashboard, 
  Store, 
  Package, 
  ShoppingCart,
  TrendingUp, 
  Settings,
  BarChart2,
  LogOut,
  Shield
} from "lucide-react"

const SYSTEM_ROLE_BADGE: Record<SystemRole, { label: string; className: string }> = {
  SUPER_ADMIN: { label: "Super Admin", className: "bg-purple-100 text-purple-700" },
  USER: { label: "User", className: "bg-gray-100 text-gray-600" },
}

export default function DashboardNav({ userEmail }: { userEmail: string }) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const isViPath = pathname === "/vi" || pathname.startsWith("/vi/")
  const normalizedPathname = pathname.replace(/^\/vi(?=\/|$)/, "") || "/"
  const isSuperAdmin = useIsSuperAdmin()
  const systemRole = useSystemRole()

  const [alertCount, setAlertCount] = useState(0)

  // Background fetch alert count (MTD) for nav badge
  useEffect(() => {
    const { startDate, endDate } = getCurrentMonthToDateRange()
    fetch(`/api/reports/alerts?startDate=${startDate}&endDate=${endDate}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.summary) {
          setAlertCount(getAlertCount(json.summary))
        }
      })
      .catch(() => {})
  }, [])

  const isActive = (path: string) => {
    if (path === "/dashboard") {
      return normalizedPathname === "/dashboard"
    }
    return normalizedPathname.startsWith(path)
  }

  const linkClass = (path: string) => {
    return isActive(path)
      ? "flex items-center px-4 py-3 text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-indigo-500 rounded-xl shadow-sm"
      : "flex items-center px-4 py-3 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all duration-200"
  }

  const localePrefix = isViPath ? "/vi" : ""
  const withLocale = (href: string) => `${localePrefix}${href}`

  const handleLogout = async () => {
    await signOut({
      callbackUrl: withLocale("/login"),
      redirect: true,
    })
  }

  const navigation = [
    { name: "Dashboard",   href: withLocale("/dashboard"),          matchPath: "/dashboard",          icon: LayoutDashboard, badge: 0 },
    { name: t('orders'),   href: withLocale("/dashboard/orders"),   matchPath: "/dashboard/orders",   icon: ShoppingCart,    badge: 0 },
    { name: t('stores'),   href: withLocale("/dashboard/stores"),   matchPath: "/dashboard/stores",   icon: Store,           badge: 0 },
    { name: t('products'), href: withLocale("/dashboard/products"), matchPath: "/dashboard/products", icon: Package,         badge: 0 },
    { name: t('ads'),      href: withLocale("/dashboard/ads"),      matchPath: "/dashboard/ads",      icon: TrendingUp,      badge: 0 },
    { name: t('reports'),  href: withLocale("/dashboard/reports"),  matchPath: "/dashboard/reports",  icon: BarChart2,       badge: alertCount },
    { name: t('settings'), href: withLocale("/dashboard/settings"), matchPath: "/dashboard/settings", icon: Settings,        badge: 0 },
  ]

  return (
    <div className="w-64 bg-white border-r border-gray-100 flex flex-col">
      {/* Logo */}
      <div className="flex items-center px-6 h-16 border-b border-gray-100">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-indigo-500 rounded-lg flex items-center justify-center shadow-sm">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">DTC StorePilot</h1>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const Icon = item.icon
          return (
            <Link key={item.name} href={item.href} className={linkClass(item.matchPath)}>
              <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
              <span className="flex-1">{item.name}</span>
              {item.badge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-xs font-bold rounded-full bg-red-100 text-red-600">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </Link>
          )
        })}

        {/* Admin section — only SUPER_ADMIN */}
        {isSuperAdmin && (
          <div className="pt-3">
            <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Admin
            </div>
            <Link href={withLocale("/dashboard/admin/users")} className={linkClass("/dashboard/admin")}>
              <Shield className="w-5 h-5 mr-3 flex-shrink-0" />
              <span className="flex-1">User Management</span>
            </Link>
          </div>
        )}

        {/* Language Switcher */}
        <div className="pt-3">
          <LanguageSwitcher />
        </div>
      </nav>

      {/* Exchange Rate */}
      <div className="px-3 pb-3">
        <ExchangeRate />
      </div>

      <div className="border-t border-gray-100 p-4 space-y-3">
        {/* User Info */}
        <div className="flex items-center px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors duration-200">
          <div className="flex-shrink-0">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-indigo-500 rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-white text-sm font-semibold">
                {userEmail.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
          <div className="ml-3 flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {userEmail.split('@')[0]}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {userEmail}
            </p>
            {systemRole && (
              <span className={`inline-block mt-0.5 text-xs px-1.5 py-0.5 rounded-full font-medium ${SYSTEM_ROLE_BADGE[systemRole].className}`}>
                {SYSTEM_ROLE_BADGE[systemRole].label}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          {t('logout')}
        </button>
      </div>
    </div>
  )
}
