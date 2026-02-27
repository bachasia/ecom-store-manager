import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"

// POST /api/sync/cancel/[storeId] - Hard stop sync đang chạy
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

    const runningSyncLogs = await prisma.syncLog.count({
      where: {
        storeId,
        status: 'started',
        completedAt: null,
      }
    })

    // Idempotent cancel: do not fail when already cancelling/no active job
    if (store.lastSyncStatus !== 'in_progress' && store.lastSyncStatus !== 'cancelling' && runningSyncLogs === 0) {
      return NextResponse.json({ success: true, message: "No active sync to cancel" })
    }

    // Cập nhật các syncLog đang chạy
    const cancelledLogs = await prisma.syncLog.updateMany({
      where: {
        storeId,
        status: 'started',
        completedAt: null,
      },
      data: {
        status: 'cancelled',
        errorMessage: 'Cancelled by user',
        completedAt: new Date(),
      }
    })

    // Nếu không còn log started thì không giữ trạng thái 'cancelling' để tránh kẹt lock
    await prisma.store.update({
      where: { id: storeId },
      data: {
        lastSyncStatus: cancelledLogs.count > 0 ? 'cancelled' : null,
        lastSyncError: cancelledLogs.count > 0 ? 'Cancelled by user' : null,
      }
    })

    return NextResponse.json({ success: true, message: "Sync cancellation requested" })
  } catch (error: any) {
    console.error("Cancel sync error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to cancel sync" },
      { status: 500 }
    )
  }
}
