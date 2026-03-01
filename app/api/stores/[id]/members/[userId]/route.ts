import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { requireStorePermission } from "@/lib/permissions"
import { STORE_ROLE } from "@/lib/roles"
import { z } from "zod"

const updateRoleSchema = z.object({
  role: z.nativeEnum(STORE_ROLE),
})

// PUT /api/stores/[id]/members/[userId] — change role of a store member
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, userId } = await params
    const denied = await requireStorePermission(session.user.id, id, 'manage_members')
    if (denied) return denied

    // Cannot change OWNER's own role
    if (userId === session.user.id) {
      return NextResponse.json(
        { error: "Cannot change your own role" },
        { status: 400 }
      )
    }

    const body = await req.json()
    const { role } = updateRoleSchema.parse(body)

    // Cannot demote/promote an OWNER via this endpoint
    const existing = await prisma.storeUser.findUnique({
      where: { storeId_userId: { storeId: id, userId } }
    })

    if (!existing) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 })
    }

    if (existing.role === STORE_ROLE.OWNER) {
      return NextResponse.json(
        { error: "Cannot change role of store owner" },
        { status: 400 }
      )
    }

    const updated = await prisma.storeUser.update({
      where: { storeId_userId: { storeId: id, userId } },
      data: { role },
      include: {
        user: { select: { id: true, email: true, name: true } }
      }
    })

    return NextResponse.json({ member: updated })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error("Update member role error:", error)
    return NextResponse.json({ error: "Failed to update member role" }, { status: 500 })
  }
}

// DELETE /api/stores/[id]/members/[userId] — remove a member from store
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, userId } = await params
    const denied = await requireStorePermission(session.user.id, id, 'manage_members')
    if (denied) return denied

    // Cannot remove yourself
    if (userId === session.user.id) {
      return NextResponse.json(
        { error: "Cannot remove yourself from the store" },
        { status: 400 }
      )
    }

    const existing = await prisma.storeUser.findUnique({
      where: { storeId_userId: { storeId: id, userId } }
    })

    if (!existing) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 })
    }

    if (existing.role === STORE_ROLE.OWNER) {
      return NextResponse.json(
        { error: "Cannot remove the store owner" },
        { status: 400 }
      )
    }

    await prisma.storeUser.delete({
      where: { storeId_userId: { storeId: id, userId } }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Remove store member error:", error)
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 })
  }
}
