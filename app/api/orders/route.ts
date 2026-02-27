import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"

// GET /api/orders - List orders with filters
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get("storeId")
    const status = searchParams.get("status")
    const search = searchParams.get("search")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "50")
    const skip = (page - 1) * limit

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

    // Status filter
    if (status) {
      where.status = status
    }

    // Date range filter (inclusive by day)
    if (startDate || endDate) {
      where.orderDate = {}
      if (startDate) {
        where.orderDate.gte = new Date(`${startDate}T00:00:00.000Z`)
      }
      if (endDate) {
        const endExclusive = new Date(`${endDate}T00:00:00.000Z`)
        endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
        where.orderDate.lt = endExclusive
      }
    }

    // Search filter
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customerEmail: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Get total count
    const total = await prisma.order.count({ where })

    // Get orders
    const orders = await prisma.order.findMany({
      where,
      include: {
        store: {
          select: {
            id: true,
            name: true,
            platform: true,
          }
        },
        paymentGateway: {
          select: {
            id: true,
            displayName: true,
          }
        },
        _count: {
          select: {
            orderItems: true
          }
        }
      },
      orderBy: {
        orderDate: 'desc'
      },
      skip,
      take: limit,
    })

    return NextResponse.json({
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })

  } catch (error: any) {
    console.error("Get orders error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to get orders" },
      { status: 500 }
    )
  }
}
