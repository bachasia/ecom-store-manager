"use client"

import { useSession } from "next-auth/react"
import { SYSTEM_ROLE, type SystemRole } from "@/lib/roles"

/**
 * Returns true if the current session user is a SUPER_ADMIN.
 * Based on the JWT token — fast, no extra DB call.
 */
export function useIsSuperAdmin(): boolean {
  const { data: session } = useSession()
  return session?.user?.systemRole === SYSTEM_ROLE.SUPER_ADMIN
}

/**
 * Returns the systemRole of the current session user.
 */
export function useSystemRole(): SystemRole | undefined {
  const { data: session } = useSession()
  return session?.user?.systemRole
}
