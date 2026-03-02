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
    const { baseCost, effectiveDate, note } = body

    if (baseCost === undefined || baseCost < 0) {
      return NextResponse.json({ error: "Invalid base cost" }, { status: 400 })
    }

    // Verify product exists and check edit permission
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, storeId: true, baseCost: true }
    })

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    const denied = await requireStorePermission(session.user.id, product.storeId, 'edit_products')
    if (denied) return denied

    // Always update baseCost (current price display)
    const updated = await prisma.product.update({
      where: { id },
      data: { baseCost },
    })

    // If effectiveDate provided → write cost history and recalculate only affected orders
    // If no effectiveDate → legacy behaviour: cascade to all OrderItems (old flow)
    if (effectiveDate) {
      const effDate = new Date(effectiveDate)

      // 1. Upsert into cost history (prevent duplicate entry for same effectiveDate)
      await prisma.productCostHistory.upsert({
        where: {
          // no unique constraint on productId+effectiveDate, so we find manually and upsert via a workaround
          // Use a raw approach: try to find existing and update, else create
          id: (await prisma.productCostHistory.findFirst({
            where: { productId: id, effectiveDate: effDate },
            select: { id: true },
          }))?.id ?? "nonexistent",
        },
        update: { cost: baseCost, note: note ?? null },
        create: {
          productId: id,
          cost: baseCost,
          effectiveDate: effDate,
          note: note ?? null,
        },
      })

      // 2. Recalculate unitCost/totalCost only for orders ON OR AFTER effectiveDate
      //    using the correct historical cost per order date
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "OrderItem" oi
        SET
          "unitCost"  = sub.resolved_cost,
          "totalCost" = sub.resolved_cost * oi."quantity"
        FROM (
          SELECT
            oi2."id",
            -- pick the most recent history entry with effectiveDate <= order date
            COALESCE(
              (SELECT pch."cost"
               FROM "ProductCostHistory" pch
               WHERE pch."productId" = oi2."productId"
                 AND pch."effectiveDate" <= o."orderDate"
               ORDER BY pch."effectiveDate" DESC
               LIMIT 1),
              p."baseCost"
            ) AS resolved_cost
          FROM "OrderItem" oi2
          JOIN "Order" o ON o."id" = oi2."orderId"
          JOIN "Product" p ON p."id" = oi2."productId"
          WHERE oi2."productId" = ${id}
            AND o."orderDate" >= ${effDate}
        ) sub
        WHERE oi."id" = sub."id"
      `)
    } else {
      // Legacy: no date provided → apply to all orders (old behaviour, overwrite everything)
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "OrderItem"
        SET
          "unitCost"  = ${baseCost},
          "totalCost" = ${baseCost} * "quantity"
        WHERE "productId" = ${id}
      `)
    }

    // Recalculate Order.totalCOGS → grossProfit → netProfit for affected orders
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
      message: effectiveDate ? "COGS updated with cost history" : "COGS updated",
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
