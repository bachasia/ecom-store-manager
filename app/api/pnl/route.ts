import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { calculateAggregatePL, calculatePLByDate, calculatePLByMonth } from "@/lib/calculations/pnl"

// GET /api/pnl - Get P&L metrics with filters
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
    const groupBy = searchParams.get("groupBy") || "total" // total | day | month

    // Build query filters
    const where: any = {}

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

      where.storeId = storeId
    } else {
      // Get all user's stores
      const userStores = await prisma.store.findMany({
        where: { userId: session.user.id },
        select: { id: true }
      })

      where.storeId = {
        in: userStores.map(s => s.id)
      }
    }

    // Date filters
    if (startDate || endDate) {
      where.orderDate = {}
      if (startDate) {
        where.orderDate.gte = new Date(startDate)
      }
      if (endDate) {
        where.orderDate.lte = new Date(endDate)
      }
    }

    // Only include completed orders
    where.status = {
      in: ['completed', 'processing', 'paid']
    }

    // Fetch orders with necessary data
    const orders = await prisma.order.findMany({
      where,
      select: {
        id: true,
        orderDate: true,
        total: true,
        refundAmount: true,
        totalCOGS: true,
        transactionFee: true,
        allocatedAdsCost: true,
        grossProfit: true,
        netProfit: true,
        profitMargin: true,
      },
      orderBy: {
        orderDate: 'asc'
      }
    })

    // Convert Decimal to number for calculations
    const ordersForCalc = orders.map(order => ({
      id: order.id,
      orderDate: order.orderDate,
      total: Number(order.total),
      refundAmount: Number(order.refundAmount),
      totalCOGS: Number(order.totalCOGS),
      transactionFee: Number(order.transactionFee),
      allocatedAdsCost: Number(order.allocatedAdsCost),
    }))

    // Calculate P&L based on groupBy parameter
    let result: any

    if (groupBy === "day") {
      const plByDate = calculatePLByDate(ordersForCalc)
      result = {
        groupBy: "day",
        data: Array.from(plByDate.entries()).map(([date, metrics]) => ({
          date,
          ...metrics
        }))
      }
    } else if (groupBy === "month") {
      const plByMonth = calculatePLByMonth(ordersForCalc)
      result = {
        groupBy: "month",
        data: Array.from(plByMonth.entries()).map(([month, metrics]) => ({
          month,
          ...metrics
        }))
      }
    } else {
      // Total aggregate
      const metrics = calculateAggregatePL(ordersForCalc)
      result = {
        groupBy: "total",
        orderCount: orders.length,
        ...metrics
      }
    }

    return NextResponse.json(result)

  } catch (error: any) {
    console.error("P&L calculation error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to calculate P&L" },
      { status: 500 }
    )
  }
}
