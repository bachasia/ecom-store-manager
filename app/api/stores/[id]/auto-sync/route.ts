import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"

const MIN_INTERVAL = 5    // phút
const MAX_INTERVAL = 1440 // 24h

// PATCH /api/stores/[id]/auto-sync
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify store belongs to user
    const store = await prisma.store.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })
    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    const body = await req.json()
    const { autoSyncEnabled, autoSyncInterval } = body

    // Validate
    if (autoSyncEnabled !== undefined && typeof autoSyncEnabled !== "boolean") {
      return NextResponse.json({ error: "autoSyncEnabled must be boolean" }, { status: 400 })
    }
    if (autoSyncInterval !== undefined) {
      const n = Number(autoSyncInterval)
      if (!Number.isInteger(n) || n < MIN_INTERVAL || n > MAX_INTERVAL) {
        return NextResponse.json(
          { error: `autoSyncInterval must be an integer between ${MIN_INTERVAL} and ${MAX_INTERVAL} minutes` },
          { status: 400 }
        )
      }
    }

    const data: Record<string, any> = {}
    if (autoSyncEnabled !== undefined) data.autoSyncEnabled = autoSyncEnabled
    if (autoSyncInterval !== undefined) data.autoSyncInterval = Number(autoSyncInterval)

    const updated = await prisma.store.update({
      where: { id },
      data,
      select: {
        id: true,
        autoSyncEnabled: true,
        autoSyncInterval: true,
        lastOrderAutoSyncAt: true,
        lastProductAutoSyncAt: true,
      },
    })

    return NextResponse.json({ success: true, store: updated })
  } catch (error: any) {
    console.error("Auto sync settings error:", error)
    return NextResponse.json({ error: error.message || "Failed to update auto sync settings" }, { status: 500 })
  }
}

// GET /api/stores/[id]/auto-sync — lấy settings hiện tại
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const store = await prisma.store.findFirst({
      where: { id, userId: session.user.id },
      select: {
        id: true,
        autoSyncEnabled: true,
        autoSyncInterval: true,
        lastOrderAutoSyncAt: true,
        lastProductAutoSyncAt: true,
      },
    })

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    return NextResponse.json({ store })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
