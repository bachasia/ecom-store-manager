import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/permissions"
import { SystemRole } from "@prisma/client"
import { z } from "zod"

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  systemRole: z.nativeEnum(SystemRole).optional(),
})

// GET /api/admin/users/[id] — get single user detail (SUPER_ADMIN only)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const denied = await requireSuperAdmin(session.user.id)
    if (denied) return denied

    const { id } = await params
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        systemRole: true,
        createdAt: true,
        storeMembers: {
          include: {
            store: { select: { id: true, name: true, platform: true } }
          }
        }
      }
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error("Get user error:", error)
    return NextResponse.json({ error: "Failed to get user" }, { status: 500 })
  }
}

// PUT /api/admin/users/[id] — update user (name, systemRole) (SUPER_ADMIN only)
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const denied = await requireSuperAdmin(session.user.id)
    if (denied) return denied

    const { id } = await params
    const body = await req.json()
    const data = updateUserSchema.parse(body)

    // Cannot demote yourself
    if (id === session.user.id && data.systemRole === SystemRole.USER) {
      return NextResponse.json(
        { error: "Cannot demote yourself from SUPER_ADMIN" },
        { status: 400 }
      )
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, systemRole: true }
    })

    return NextResponse.json({ user })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error("Update user error:", error)
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
  }
}

// DELETE /api/admin/users/[id] — delete user (SUPER_ADMIN only)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const denied = await requireSuperAdmin(session.user.id)
    if (denied) return denied

    const { id } = await params

    // Cannot delete yourself
    if (id === session.user.id) {
      return NextResponse.json(
        { error: "Cannot delete your own account" },
        { status: 400 }
      )
    }

    await prisma.user.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete user error:", error)
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
  }
}
