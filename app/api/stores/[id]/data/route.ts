import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { requireStorePermission } from "@/lib/permissions"

// DELETE /api/stores/[id]/data - Xóa toàn bộ dữ liệu của store (giữ lại store)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const denied = await requireStorePermission(session.user.id, id, 'manage_store')
    if (denied) return denied

    const store = await prisma.store.findUnique({ where: { id }, select: { id: true } })
    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    // Xóa theo thứ tự để tránh FK constraint
    // OrderItem → Order → Product, SyncLog (tất cả có onDelete: Cascade từ Store)
    // Nhưng vì xóa trực tiếp không qua store.delete, cần xóa thủ công

    const [deletedOrders, deletedProducts, deletedSyncLogs, deletedAdsCosts] = await prisma.$transaction([
      prisma.order.deleteMany({ where: { storeId: id } }),
      prisma.product.deleteMany({ where: { storeId: id } }),
      prisma.syncLog.deleteMany({ where: { storeId: id } }),
      (prisma as any).adsCost.deleteMany({ where: { storeId: id } }),
    ])

    // Reset sync metadata trên store (trong transaction riêng để không rollback nếu update fail)
    await prisma.store.update({
      where: { id },
      data: {
        lastSyncAt: null,
        lastSyncStatus: null,
        lastSyncError: null,
      }
    })

    return NextResponse.json({
      success: true,
      message: `Đã xóa ${deletedOrders.count} đơn hàng, ${deletedProducts.count} sản phẩm, ${deletedAdsCosts.count} ads cost`,
      stats: {
        orders: deletedOrders.count,
        products: deletedProducts.count,
        syncLogs: deletedSyncLogs.count,
        adsCosts: deletedAdsCosts.count,
      }
    })
  } catch (error: any) {
    console.error("Clear store data error:", error)
    return NextResponse.json(
      { error: error.message || "An error occurred while clearing store data" },
      { status: 500 }
    )
  }
}
