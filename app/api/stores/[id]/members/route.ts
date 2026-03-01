import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { requireStorePermission, storeRoleLabel } from "@/lib/permissions"
import { STORE_ROLE } from "@/lib/roles"
import { z } from "zod"

const addMemberSchema = z.object({
  email: z.string().email("Invalid email"),
  role: z.nativeEnum(STORE_ROLE),
})

// GET /api/stores/[id]/members — list members of a store
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const denied = await requireStorePermission(session.user.id, id, 'manage_members')
    if (denied) return denied

    const members = await prisma.storeUser.findMany({
      where: { storeId: id },
      include: {
        user: {
          select: { id: true, email: true, name: true, systemRole: true, createdAt: true }
        }
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      members: members.map((m) => ({
        id: m.id,
        role: m.role,
        roleLabel: storeRoleLabel(m.role),
        createdAt: m.createdAt,
        user: m.user,
      }))
    })
  } catch (error) {
    console.error("Get store members error:", error)
    return NextResponse.json({ error: "Failed to get store members" }, { status: 500 })
  }
}

// POST /api/stores/[id]/members — add a user to store by email
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const denied = await requireStorePermission(session.user.id, id, 'manage_members')
    if (denied) return denied

    const body = await req.json()
    const { email, role } = addMemberSchema.parse(body)

    // Find user by email
    const targetUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true }
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: "User with this email not found" },
        { status: 404 }
      )
    }

    // Cannot add yourself (you're already OWNER)
    if (targetUser.id === session.user.id) {
      return NextResponse.json(
        { error: "Cannot add yourself as a member" },
        { status: 400 }
      )
    }

    // Check if already a member
    const existing = await prisma.storeUser.findUnique({
      where: { storeId_userId: { storeId: id, userId: targetUser.id } }
    })

    if (existing) {
      return NextResponse.json(
        { error: "User is already a member of this store" },
        { status: 400 }
      )
    }

    const member = await prisma.storeUser.create({
      data: {
        storeId: id,
        userId: targetUser.id,
        role,
      },
      include: {
        user: { select: { id: true, email: true, name: true } }
      }
    })

    return NextResponse.json({ member }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error("Add store member error:", error)
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 })
  }
}
