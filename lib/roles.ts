export const SYSTEM_ROLE = {
  SUPER_ADMIN: "SUPER_ADMIN",
  USER: "USER",
} as const

export type SystemRole = (typeof SYSTEM_ROLE)[keyof typeof SYSTEM_ROLE]

export const STORE_ROLE = {
  OWNER: "OWNER",
  MANAGER: "MANAGER",
  VIEWER: "VIEWER",
  DATA_ENTRY: "DATA_ENTRY",
} as const

export type StoreRole = (typeof STORE_ROLE)[keyof typeof STORE_ROLE]
