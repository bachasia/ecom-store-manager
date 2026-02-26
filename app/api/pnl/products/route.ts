import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { calculatePLByProduct } from "@/lib/calculations/pnl"

// GET /api/pnl/products - Get P&L metrics by product
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get("storeId")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const limit = parseInt(searchParams.get("limit") || "50")

    // Build query filters
    const where: any = {
      order: {}
    }

    if (storeId) {
      // Verify store belongs to user
      const store = await prisma.store.findFirst({
        where: {
          id: storeId,
          userId: session.user.id
        }
      })

      if (!store) {
        return NextResponse.json({ error: "Store not found" }, { status: 404 })
      }

      where.order.storeId = storeId
    } else {
      // Get all user's stores
      const userStores = await prisma.store.findMany({
        where: { userId: session.user.id },
        select: { id: true }
      })

      where.order = {
        storeId: {
          in: userStores.map(s => s.id)
        }
      }
    }

    // Date filters (inclusive by calendar day)
    if (startDate || endDate) {
      where.order.orderDate = {}
      if (startDate) {
        where.order.orderDate.gte = new Date(`${startDate}T00:00:00.000Z`)
      }
      if (endDate) {
        const endExclusive = new Date(`${endDate}T00:00:00.000Z`)
        endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
        where.order.orderDate.lt = endExclusive
      }
    }

    // Only include completed orders
    where.order.status = {
      in: ['completed', 'processing', 'paid', 'authorized']
    }

    // Fetch order items with order data
    const orderItems = await prisma.orderItem.findMany({
      where,
      select: {
        sku: true,
        productName: true,
        quantity: true,
        total: true,
        totalCost: true,
        order: {
          select: {
            id: true,
            total: true,
            refundAmount: true,
            totalCOGS: true,
            transactionFee: true,
            allocatedAdsCost: true,
          }
        }
      }
    })

    // Convert Decimal to number for calculations
    const orderItemsForCalc = orderItems.map(item => ({
      sku: item.sku,
      quantity: item.quantity,
      total: Number(item.total),
      totalCost: Number(item.totalCost),
      order: {
        id: item.order.id,
        total: Number(item.order.total),
        refundAmount: Number(item.order.refundAmount),
        totalCOGS: Number(item.order.totalCOGS),
        transactionFee: Number(item.order.transactionFee),
        allocatedAdsCost: Number(item.order.allocatedAdsCost),
      }
    }))

    // Calculate P&L by product
    const plByProduct = calculatePLByProduct(orderItemsForCalc)

    // Convert to array and sort by net profit
    const products = Array.from(plByProduct.entries())
      .map(([sku, metrics]) => {
        // Get product name from first matching item
        const item = orderItems.find(i => i.sku === sku)
        return {
          sku,
          productName: item?.productName || sku,
          ...metrics
        }
      })
      .sort((a, b) => b.netProfit - a.netProfit)
      .slice(0, limit)

    return NextResponse.json({
      products,
      total: plByProduct.size
    })

  } catch (error: any) {
    console.error("Product P&L calculation error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to calculate product P&L" },
      { status: 500 }
    )
  }
}
