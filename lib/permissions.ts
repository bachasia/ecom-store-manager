import { SYSTEM_ROLE, STORE_ROLE, type SystemRole, type StoreRole } from '@/lib/roles'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export { SYSTEM_ROLE, STORE_ROLE }

// ---------------------------------------------------------------------------
// Action definitions
// ---------------------------------------------------------------------------

export type StoreAction =
  | 'view_dashboard'   // view P&L, reports, KPIs
  | 'view_orders'      // view orders list & detail
  | 'view_products'    // view products list
  | 'edit_products'    // edit COGS, bulk update, import CSV
  | 'manage_ads'       // add/import ads cost
  | 'manage_store'     // configure store, sync, delete store
  | 'manage_settings'  // payment gateways, registration toggle
  | 'manage_members'   // add/remove/change role of store members

export type SystemAction = 'manage_users' // user list, change systemRole, delete user

// ---------------------------------------------------------------------------
// Permission Matrix
// StoreRole OWNER gets all store actions
// SUPER_ADMIN bypasses all checks
// ---------------------------------------------------------------------------

const STORE_PERMISSIONS: Record<StoreRole, StoreAction[]> = {
  OWNER: [
    'view_dashboard',
    'view_orders',
    'view_products',
    'edit_products',
    'manage_ads',
    'manage_store',
    'manage_settings',
    'manage_members',
  ],
  MANAGER: [
    'view_dashboard',
    'view_orders',
    'view_products',
    'edit_products',
    'manage_ads',
  ],
  VIEWER: [
    'view_dashboard',
    'view_orders',
    'view_products',
  ],
  DATA_ENTRY: [
    'view_orders',
    'view_products',
    'edit_products',
    'manage_ads',
  ],
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Get the role a user has on a specific store.
 * Returns null if the user is not a member of the store.
 * Note: SUPER_ADMIN bypass is handled separately in permission checks.
 */
export async function getUserStoreRole(
  userId: string,
  storeId: string
): Promise<StoreRole | null> {
  const membership = await prisma.storeUser.findUnique({
    where: { storeId_userId: { storeId, userId } },
    select: { role: true },
  })
  return membership?.role ?? null
}

/**
 * Check whether a user has a specific action on a store.
 * SUPER_ADMIN always returns true.
 */
export async function hasStorePermission(
  userId: string,
  storeId: string,
  action: StoreAction
): Promise<boolean> {
  // SUPER_ADMIN bypass — check systemRole from DB (not session, to avoid stale JWT)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { systemRole: true },
  })
  if (!user) return false
  if (user.systemRole === SYSTEM_ROLE.SUPER_ADMIN) return true

  const role = await getUserStoreRole(userId, storeId)
  if (!role) return false

  return STORE_PERMISSIONS[role].includes(action)
}

/**
 * Throws a 403 NextResponse if the user doesn't have the required permission.
 * Designed to be used inside API route handlers.
 */
export async function requireStorePermission(
  userId: string,
  storeId: string,
  action: StoreAction
): Promise<NextResponse | null> {
  const allowed = await hasStorePermission(userId, storeId, action)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Forbidden: insufficient permissions' },
      { status: 403 }
    )
  }
  return null
}

/**
 * Check whether a user is a SUPER_ADMIN.
 */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { systemRole: true },
  })
  return user?.systemRole === SYSTEM_ROLE.SUPER_ADMIN
}

/**
 * Throws a 403 NextResponse if the user is not a SUPER_ADMIN.
 */
export async function requireSuperAdmin(userId: string): Promise<NextResponse | null> {
  const ok = await isSuperAdmin(userId)
  if (!ok) {
    return NextResponse.json(
      { error: 'Forbidden: super admin required' },
      { status: 403 }
    )
  }
  return null
}

/**
 * Returns the list of store IDs the user can access.
 * SUPER_ADMIN → all stores in the system.
 * Regular user → only stores they are a member of.
 */
export async function getAccessibleStoreIds(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { systemRole: true },
  })
  if (!user) return []

  if (user.systemRole === SYSTEM_ROLE.SUPER_ADMIN) {
    const allStores = await prisma.store.findMany({ select: { id: true } })
    return allStores.map((s: { id: string }) => s.id)
  }

  const memberships = await prisma.storeUser.findMany({
    where: { userId },
    select: { storeId: true },
  })
  return memberships.map((m: { storeId: string }) => m.storeId)
}

/**
 * Get all store IDs the user has a specific action on.
 * Used for filtering queries (e.g. only stores where user can view_dashboard).
 * SUPER_ADMIN gets all stores regardless.
 */
export async function getStoreIdsWithPermission(
  userId: string,
  action: StoreAction
): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { systemRole: true },
  })
  if (!user) return []

  if (user.systemRole === SYSTEM_ROLE.SUPER_ADMIN) {
    const allStores = await prisma.store.findMany({ select: { id: true } })
    return allStores.map((s: { id: string }) => s.id)
  }

  // Find roles that include this action
  const allowedRoles = (Object.entries(STORE_PERMISSIONS) as [StoreRole, StoreAction[]][])
    .filter(([, actions]) => actions.includes(action))
    .map(([role]) => role)

  const memberships = await prisma.storeUser.findMany({
    where: { userId, role: { in: allowedRoles } },
    select: { storeId: true },
  })
  return memberships.map((m: { storeId: string }) => m.storeId)
}

/**
 * Get the display label for a StoreRole.
 */
export function storeRoleLabel(role: StoreRole): string {
  const labels: Record<StoreRole, string> = {
    OWNER: 'Owner',
    MANAGER: 'Manager',
    VIEWER: 'Viewer',
    DATA_ENTRY: 'Data Entry',
  }
  return labels[role]
}

/**
 * Get the display label for a SystemRole.
 */
export function systemRoleLabel(role: SystemRole): string {
  const labels: Record<SystemRole, string> = {
    SUPER_ADMIN: 'Super Admin',
    USER: 'User',
  }
  return labels[role]
}
