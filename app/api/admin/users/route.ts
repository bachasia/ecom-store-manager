import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/permissions"
import { hash } from "bcryptjs"
import { z } from "zod"
import { SystemRole } from "@prisma/client"

const createUserSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1).optional(),
  systemRole: z.nativeEnum(SystemRole).default(SystemRole.USER),
})

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

// POST /api/admin/users — create a new user (SUPER_ADMIN only)
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const denied = await requireSuperAdmin(session.user.id)
    if (denied) return denied

    const body = await req.json()
    const { email, password, name, systemRole } = createUserSchema.parse(body)

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: "Email already in use" }, { status: 400 })
    }

    const hashedPassword = await hash(password, 12)

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || null,
        systemRole,
      },
      select: { id: true, email: true, name: true, systemRole: true, createdAt: true },
    })

    return NextResponse.json({ user }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error("Create user error:", error)
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 })
  }
}
