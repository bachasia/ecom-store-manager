import { getServerSession } from "next-auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import DashboardNav from "@/components/dashboard/DashboardNav"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  const requestHeaders = await headers()
  const locale = requestHeaders.get("x-locale") === "vi" ? "vi" : "en"

  if (!session) {
    const loginPath = locale === "vi" ? "/vi/login" : "/login"
    const callbackUrl = locale === "vi" ? "/vi/dashboard" : "/dashboard"
    redirect(`${loginPath}?callbackUrl=${encodeURIComponent(callbackUrl)}&reason=auth_required`)
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Sidebar */}
      <DashboardNav userEmail={session.user?.email || ""} />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <div className="py-8 px-6 sm:px-8 lg:px-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
