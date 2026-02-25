"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { useTranslations } from 'next-intl'
import LanguageSwitcher from "@/components/language-switcher"
import { 
  LayoutDashboard, 
  Store, 
  Package, 
  ShoppingCart,
  TrendingUp, 
  Settings,
  LogOut
} from "lucide-react"

export default function DashboardNav({ userEmail }: { userEmail: string }) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const isViPath = pathname === "/vi" || pathname.startsWith("/vi/")
  const normalizedPathname = pathname.replace(/^\/vi(?=\/|$)/, "") || "/"

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

  const navigation = [
    { name: "Dashboard", href: withLocale("/dashboard"), matchPath: "/dashboard", icon: LayoutDashboard },
    { name: t('orders'), href: withLocale("/dashboard/orders"), matchPath: "/dashboard/orders", icon: ShoppingCart },
    { name: t('stores'), href: withLocale("/dashboard/stores"), matchPath: "/dashboard/stores", icon: Store },
    { name: t('products'), href: withLocale("/dashboard/products"), matchPath: "/dashboard/products", icon: Package },
    { name: t('ads'), href: withLocale("/dashboard/ads"), matchPath: "/dashboard/ads", icon: TrendingUp },
    { name: t('settings'), href: withLocale("/dashboard/settings"), matchPath: "/dashboard/settings", icon: Settings },
  ]

  return (
    <div className="w-64 bg-white border-r border-gray-100 flex flex-col">
      {/* Logo */}
      <div className="flex items-center px-6 h-16 border-b border-gray-100">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-indigo-500 rounded-lg flex items-center justify-center shadow-sm">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">P&L Dashboard</h1>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const Icon = item.icon
          return (
            <Link key={item.name} href={item.href} className={linkClass(item.matchPath)}>
              <Icon className="w-5 h-5 mr-3" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-gray-100 p-4 space-y-3">
        <LanguageSwitcher />

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
          </div>
        </div>
      </div>
    </div>
  )
}
