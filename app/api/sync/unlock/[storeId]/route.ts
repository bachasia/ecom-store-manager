import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"

// POST /api/sync/unlock/[storeId] - Force unlock stuck sync state
export async function POST(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const store = await prisma.store.findFirst({
      where: { id: storeId, userId: session.user.id }
    })

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    await prisma.syncLog.updateMany({
      where: {
        storeId,
        status: 'started',
        completedAt: null,
      },
      data: {
        status: 'cancelled',
        errorMessage: 'Force unlocked by user',
        completedAt: new Date(),
      }
    })

    await prisma.store.update({
      where: { id: storeId },
      data: {
        lastSyncStatus: null,
        lastSyncError: null,
      }
    })

    return NextResponse.json({ success: true, message: "Sync unlocked" })
  } catch (error: any) {
    console.error("Unlock sync error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to unlock sync" },
      { status: 500 }
    )
  }
}
