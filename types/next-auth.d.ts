import { DefaultSession } from "next-auth"
import type { SystemRole } from "@/lib/roles"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      systemRole: SystemRole
    } & DefaultSession["user"]
  }

  interface User {
    id: string
    systemRole: SystemRole
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    systemRole: SystemRole
  }
}
