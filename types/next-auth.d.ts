import { DefaultSession } from "next-auth"
import { SystemRole } from "@prisma/client"

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
