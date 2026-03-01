import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth/options"
import { SYSTEM_ROLE } from "@/lib/roles"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect("/login")
  }

  if (session.user?.systemRole !== SYSTEM_ROLE.SUPER_ADMIN) {
    redirect("/dashboard")
  }

  return <>{children}</>
}
