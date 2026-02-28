import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { requireStorePermission } from "@/lib/permissions"

// POST /api/products/bulk-update - Bulk update COGS from CSV
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { storeId, products } = body
    // products: Array of { sku, baseCost }

    if (!storeId || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 })
    }

    // Verify store permission (edit_products)
    const denied = await requireStorePermission(session.user.id, storeId, 'edit_products')
    if (denied) return denied

    // Verify store exists and is accessible
    const store = await prisma.store.findUnique({
      where: { id: storeId },
    })

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    // Validate rows up-front — separate valid from invalid
    const validItems = products.filter(
      (item: any) => item.sku && item.baseCost !== undefined && parseFloat(item.baseCost) >= 0
    )
    const errors = products.length - validItems.length

    if (validItems.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No valid rows to update",
        stats: { total: products.length, updated: 0, notFound: 0, errors },
        notFoundSkus: [],
      })
    }

    // Fetch all matching products in one query (by SKU within store)
    const skus = [...new Set(validItems.map((i: any) => String(i.sku).trim()))]
    const existingProducts = await prisma.product.findMany({
      where: { storeId, sku: { in: skus } },
      select: { id: true, sku: true },
    })

    // Map sku → id[] để xử lý đúng khi có nhiều product cùng SKU trong store
    const productBySku = new Map<string, string[]>()
    for (const p of existingProducts) {
      const ids = productBySku.get(p.sku) ?? []
      ids.push(p.id)
      productBySku.set(p.sku, ids)
    }

    const notFoundSkus: string[] = []
    const updateMap = new Map<string, number>()

    for (const item of validItems) {
      const sku = String(item.sku).trim()
      const cost = parseFloat(item.baseCost)
      const productIds = productBySku.get(sku)
      if (!productIds) {
        notFoundSkus.push(sku)
      } else {
        for (const productId of productIds) {
          updateMap.set(productId, cost)
        }
      }
    }

    const notFound = notFoundSkus.length

    if (updateMap.size === 0) {
      return NextResponse.json({
        success: true,
        message: "No products found to update",
        stats: { total: products.length, updated: 0, notFound, errors },
        notFoundSkus: notFoundSkus.slice(0, 10),
      })
    }

    // Batch update Product.baseCost in one transaction
    await prisma.$transaction(
      Array.from(updateMap.entries()).map(([id, baseCost]) =>
        prisma.product.update({ where: { id }, data: { baseCost } })
      )
    )

    const updatedProductIds = Array.from(updateMap.keys())

    // Cascade step 1: update OrderItem.unitCost + totalCost for all affected products
    // Uses a VALUES list so it's a single UPDATE … JOIN instead of N queries
    const costValues = Prisma.join(
      Array.from(updateMap.entries()).map(
        ([id, cost]) => Prisma.sql`(${id}::text, ${cost}::numeric)`
      )
    )

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OrderItem" oi
      SET
        "unitCost"  = v.cost,
        "totalCost" = v.cost * oi."quantity"
      FROM (VALUES ${costValues}) AS v(product_id, cost)
      WHERE oi."productId" = v.product_id
    `)

    // Cascade step 2: recalculate Order.totalCOGS for affected orders
    const productIdList = Prisma.join(updatedProductIds.map((id) => Prisma.sql`${id}`))

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Order" o
      SET "totalCOGS" = (
        SELECT COALESCE(SUM(oi."totalCost"), 0)
        FROM "OrderItem" oi
        WHERE oi."orderId" = o."id"
      )
      WHERE o."id" IN (
        SELECT DISTINCT "orderId" FROM "OrderItem" WHERE "productId" IN (${productIdList})
      )
    `)

    // Cascade step 3: recalculate Order P&L from updated totalCOGS
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
        SELECT DISTINCT "orderId" FROM "OrderItem" WHERE "productId" IN (${productIdList})
      )
    `)

    return NextResponse.json({
      success: true,
      message: `Updated ${updateMap.size} products`,
      stats: {
        total: products.length,
        updated: updateMap.size,
        notFound,
        errors,
      },
      notFoundSkus: notFoundSkus.slice(0, 10),
    })
  } catch (error: any) {
    console.error("Bulk update error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to bulk update products" },
      { status: 500 }
    )
  }
}
