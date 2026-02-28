import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { requireStorePermission } from "@/lib/permissions"

const updateSchema = z.object({
  description: z.string().optional(),
})

// DELETE /api/ads/account-mappings/[id]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const mapping = await prisma.adsAccountMapping.findUnique({
      where: { id },
    })

    if (!mapping) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 })
    }

    // Kiểm tra quyền manage_ads trên store của mapping
    const denied = await requireStorePermission(session.user.id, mapping.storeId, "manage_ads")
    if (denied) return denied

    await prisma.adsAccountMapping.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE /api/ads/account-mappings/[id] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH /api/ads/account-mappings/[id] — cập nhật description
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const mapping = await prisma.adsAccountMapping.findUnique({
      where: { id },
    })

    if (!mapping) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 })
    }

    const denied = await requireStorePermission(session.user.id, mapping.storeId, "manage_ads")
    if (denied) return denied

    const body = await req.json()
    const data = updateSchema.parse(body)

    const updated = await prisma.adsAccountMapping.update({
      where: { id },
      data,
      include: {
        store: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({ mapping: updated })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error("PATCH /api/ads/account-mappings/[id] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
