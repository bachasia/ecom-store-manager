import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/permissions"

// GET /api/admin/users — list all users (SUPER_ADMIN only)
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const denied = await requireSuperAdmin(session.user.id)
    if (denied) return denied

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        systemRole: true,
        createdAt: true,
        _count: {
          select: { storeMembers: true }
        }
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        systemRole: u.systemRole,
        createdAt: u.createdAt,
        storeCount: u._count.storeMembers,
      }))
    })
  } catch (error) {
    console.error("Get users error:", error)
    return NextResponse.json({ error: "Failed to get users" }, { status: 500 })
  }
}
