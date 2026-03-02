import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { requireStorePermission } from "@/lib/permissions"

// GET /api/products/[id]/cost-history — list all cost history entries for a product
export async function GET(
  _req: Request,
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
      select: { id: true, storeId: true, baseCost: true },
    })
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 })

    const denied = await requireStorePermission(session.user.id, product.storeId, "view_products")
    if (denied) return denied

    const history = await prisma.productCostHistory.findMany({
      where: { productId: id },
      orderBy: { effectiveDate: "desc" },
    })

    return NextResponse.json({
      baseCost: Number(product.baseCost),
      history: history.map((h) => ({
        id: h.id,
        cost: Number(h.cost),
        effectiveDate: h.effectiveDate.toISOString().slice(0, 10),
        note: h.note,
        createdAt: h.createdAt,
      })),
    })
  } catch (error: any) {
    console.error("Get cost history error:", error)
    return NextResponse.json({ error: error.message || "Failed to get cost history" }, { status: 500 })
  }
}

// POST /api/products/[id]/cost-history — add a new cost entry (effectiveDate + cost)
export async function POST(
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
    const { cost, effectiveDate, note } = body

    if (cost === undefined || cost < 0) {
      return NextResponse.json({ error: "Invalid cost" }, { status: 400 })
    }
    if (!effectiveDate) {
      return NextResponse.json({ error: "effectiveDate is required" }, { status: 400 })
    }

    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, storeId: true },
    })
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 })

    const denied = await requireStorePermission(session.user.id, product.storeId, "edit_products")
    if (denied) return denied

    const effDate = new Date(effectiveDate)

    // Upsert: if same productId+effectiveDate exists, update cost/note
    const existing = await prisma.productCostHistory.findFirst({
      where: { productId: id, effectiveDate: effDate },
      select: { id: true },
    })

    const entry = existing
      ? await prisma.productCostHistory.update({
          where: { id: existing.id },
          data: { cost, note: note ?? null },
        })
      : await prisma.productCostHistory.create({
          data: { productId: id, cost, effectiveDate: effDate, note: note ?? null },
        })

    // Update Product.baseCost to reflect latest cost if this entry is the newest
    const latestEntry = await prisma.productCostHistory.findFirst({
      where: { productId: id },
      orderBy: { effectiveDate: "desc" },
      select: { cost: true },
    })
    if (latestEntry) {
      await prisma.product.update({
        where: { id },
        data: { baseCost: latestEntry.cost },
      })
    }

    // Recalculate unitCost for orders on/after effectiveDate using historical lookup
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OrderItem" oi
      SET
        "unitCost"  = sub.resolved_cost,
        "totalCost" = sub.resolved_cost * oi."quantity"
      FROM (
        SELECT
          oi2."id",
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

    // Re-sum totalCOGS and recalculate P&L
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
      entry: {
        id: entry.id,
        cost: Number(entry.cost),
        effectiveDate: entry.effectiveDate.toISOString().slice(0, 10),
        note: entry.note,
        createdAt: entry.createdAt,
      },
    })
  } catch (error: any) {
    console.error("Add cost history error:", error)
    return NextResponse.json({ error: error.message || "Failed to add cost history" }, { status: 500 })
  }
}

// DELETE /api/products/[id]/cost-history?entryId=xxx — remove a history entry
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

    const { searchParams } = new URL(req.url)
    const entryId = searchParams.get("entryId")
    if (!entryId) return NextResponse.json({ error: "entryId required" }, { status: 400 })

    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, storeId: true },
    })
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 })

    const denied = await requireStorePermission(session.user.id, product.storeId, "edit_products")
    if (denied) return denied

    const entry = await prisma.productCostHistory.findUnique({
      where: { id: entryId },
      select: { id: true, productId: true, effectiveDate: true },
    })
    if (!entry || entry.productId !== id) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 })
    }

    await prisma.productCostHistory.delete({ where: { id: entryId } })

    // Restore baseCost to latest remaining entry (or keep unchanged if none)
    const latestEntry = await prisma.productCostHistory.findFirst({
      where: { productId: id },
      orderBy: { effectiveDate: "desc" },
      select: { cost: true },
    })
    if (latestEntry) {
      await prisma.product.update({
        where: { id },
        data: { baseCost: latestEntry.cost },
      })
    }

    // Recalculate all order items for this product using remaining history
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OrderItem" oi
      SET
        "unitCost"  = sub.resolved_cost,
        "totalCost" = sub.resolved_cost * oi."quantity"
      FROM (
        SELECT
          oi2."id",
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
      ) sub
      WHERE oi."id" = sub."id"
    `)

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Order" o
      SET "totalCOGS" = (
        SELECT COALESCE(SUM(oi."totalCost"), 0)
        FROM "OrderItem" oi WHERE oi."orderId" = o."id"
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

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Delete cost history error:", error)
    return NextResponse.json({ error: error.message || "Failed to delete entry" }, { status: 500 })
  }
}
