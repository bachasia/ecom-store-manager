import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { requireStorePermission } from "@/lib/permissions"

// GET /api/products/[id] - Get single product
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

    const product = await prisma.product.findUnique({
      where: { id },
      include: { store: { select: { id: true, name: true } } }
    })

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    const denied = await requireStorePermission(session.user.id, product.storeId, 'view_products')
    if (denied) return denied

    return NextResponse.json({ product })

  } catch (error: any) {
    console.error("Get product error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to get product" },
      { status: 500 }
    )
  }
}

// PUT /api/products/[id] - Update product COGS
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { baseCost } = body

    if (baseCost === undefined || baseCost < 0) {
      return NextResponse.json({ error: "Invalid base cost" }, { status: 400 })
    }

    // Verify product exists and check edit permission
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, storeId: true }
    })

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    const denied = await requireStorePermission(session.user.id, product.storeId, 'edit_products')
    if (denied) return denied

    // Update product baseCost, then cascade to OrderItem + Order in one transaction
    const [updated] = await prisma.$transaction([
      // 1. Update Product.baseCost
      prisma.product.update({
        where: { id },
        data: { baseCost },
      }),
    ])

    // 2. Cascade: update OrderItem.unitCost + totalCost for all items of this product
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OrderItem"
      SET
        "unitCost"  = ${baseCost},
        "totalCost" = ${baseCost} * "quantity"
      WHERE "productId" = ${id}
    `)

    // 3. Recalculate Order.totalCOGS by re-summing its OrderItems
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Order" o
      SET "totalCOGS" = (
        SELECT COALESCE(SUM(oi."totalCost"), 0)
        FROM "OrderItem" oi
        WHERE oi."orderId" = o."id"
      )
      WHERE o."id" IN (
        SELECT DISTINCT "orderId" FROM "OrderItem" WHERE "productId" = ${id}
      )
    `)

    // 4. Recalculate Order P&L fields from updated totalCOGS
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Order"
      SET
        "grossProfit"  = ("total" - "refundAmount") - "totalCOGS",
        "netProfit"    = ("total" - "refundAmount") - "totalCOGS" - "transactionFee" - "allocatedAdsCost",
        "profitMargin" = CASE
          WHEN ("total" - "refundAmount") > 0
          THEN ROUND(
            (("total" - "refundAmount") - "totalCOGS" - "transactionFee" - "allocatedAdsCost")
            / ("total" - "refundAmount") * 100,
            2
          )
          ELSE 0
        END
      WHERE "id" IN (
        SELECT DISTINCT "orderId" FROM "OrderItem" WHERE "productId" = ${id}
      )
    `)

    return NextResponse.json({
      success: true,
      message: "COGS updated",
      product: updated
    })

  } catch (error: any) {
    console.error("Update product error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to update product" },
      { status: 500 }
    )
  }
}
