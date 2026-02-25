import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"

// GET /api/products - List products with filters
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get("storeId")
    const search = searchParams.get("search")
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

    // Search filter
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Get total count
    const total = await prisma.product.count({ where })

    // Get products
    const products = await prisma.product.findMany({
      where,
      include: {
        store: {
          select: {
            id: true,
            name: true,
          }
        },
        _count: {
          select: {
            orderItems: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      },
      skip,
      take: limit,
    })

    return NextResponse.json({
      products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })

  } catch (error: any) {
    console.error("Get products error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to get products" },
      { status: 500 }
    )
  }
}

// PUT /api/products - Bulk update COGS
export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { updates } = body // Array of { id, baseCost }

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: "Invalid updates data" }, { status: 400 })
    }

    // Verify all products belong to user's stores
    const productIds = updates.map(u => u.id)
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        store: {
          userId: session.user.id
        }
      },
      select: { id: true }
    })

    if (products.length !== productIds.length) {
      return NextResponse.json({ error: "Some products not found or unauthorized" }, { status: 403 })
    }

    // Update products
    let updated = 0
    for (const update of updates) {
      await prisma.product.update({
        where: { id: update.id },
        data: { baseCost: update.baseCost }
      })
      updated++
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updated} products`,
      updated
    })

  } catch (error: any) {
    console.error("Bulk update products error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to update products" },
      { status: 500 }
    )
  }
}
