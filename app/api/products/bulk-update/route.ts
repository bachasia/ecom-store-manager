import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { requireStorePermission } from "@/lib/permissions"

// POST /api/products/bulk-update - Bulk update COGS from CSV
// products: Array of { externalId?, sku?, baseCost }
//   - If externalId is present → lookup by storeId + externalId (exact, most accurate)
//   - Otherwise              → lookup by storeId + sku (fallback, may match multiple variants)
// effectiveDate: optional ISO date string (YYYY-MM-DD)
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { storeId, products, effectiveDate } = body

    if (!storeId || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 })
    }

    // Verify store permission (edit_products)
    const denied = await requireStorePermission(session.user.id, storeId, "edit_products")
    if (denied) return denied

    // Verify store exists and is accessible
    const store = await prisma.store.findUnique({ where: { id: storeId } })
    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    // Parse effectiveDate (optional)
    const effDate = effectiveDate ? new Date(effectiveDate) : null
    if (effectiveDate && isNaN(effDate!.getTime())) {
      return NextResponse.json({ error: "Invalid effectiveDate" }, { status: 400 })
    }

    // Validate rows: must have (externalId OR sku) AND a non-negative baseCost
    const validItems = products.filter((item: any) => {
      const hasId = (item.externalId && String(item.externalId).trim()) ||
                    (item.sku && String(item.sku).trim())
      return hasId && item.baseCost !== undefined && parseFloat(item.baseCost) >= 0
    })
    const errors = products.length - validItems.length

    if (validItems.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No valid rows to update",
        stats: { total: products.length, updated: 0, notFound: 0, errors },
        notFoundIds: [],
      })
    }

    // Split items into two buckets: externalId-based vs sku-based
    const byExternalId: Array<{ externalId: string; cost: number }> = []
    const bySkuOnly:    Array<{ sku: string; cost: number }> = []

    for (const item of validItems) {
      const cost = parseFloat(item.baseCost)
      const extId = item.externalId ? String(item.externalId).trim() : ""
      const sku   = item.sku        ? String(item.sku).trim()        : ""
      if (extId) {
        byExternalId.push({ externalId: extId, cost })
      } else {
        bySkuOnly.push({ sku, cost })
      }
    }

    // ── Resolve product IDs ──────────────────────────────────────────────────

    // Map productId → cost (final updateMap)
    const updateMap = new Map<string, number>()
    const notFoundIds: string[] = []

    // 1. Lookup by externalId (one query for all)
    if (byExternalId.length > 0) {
      const extIds = [...new Set(byExternalId.map((i) => i.externalId))]
      const found = await prisma.product.findMany({
        where: { storeId, externalId: { in: extIds } },
        select: { id: true, externalId: true },
      })
      const byExt = new Map<string, string[]>()
      for (const p of found) {
        const ids = byExt.get(p.externalId) ?? []
        ids.push(p.id)
        byExt.set(p.externalId, ids)
      }
      for (const item of byExternalId) {
        const ids = byExt.get(item.externalId)
        if (!ids) {
          notFoundIds.push(item.externalId)
        } else {
          for (const id of ids) updateMap.set(id, item.cost)
        }
      }
    }

    // 2. Lookup by sku (one query for all)
    if (bySkuOnly.length > 0) {
      const skus = [...new Set(bySkuOnly.map((i) => i.sku))]
      const found = await prisma.product.findMany({
        where: { storeId, sku: { in: skus } },
        select: { id: true, sku: true },
      })
      const bySku = new Map<string, string[]>()
      for (const p of found) {
        const ids = bySku.get(p.sku) ?? []
        ids.push(p.id)
        bySku.set(p.sku, ids)
      }
      for (const item of bySkuOnly) {
        const ids = bySku.get(item.sku)
        if (!ids) {
          notFoundIds.push(item.sku)
        } else {
          for (const id of ids) updateMap.set(id, item.cost)
        }
      }
    }

    const notFound = notFoundIds.length

    if (updateMap.size === 0) {
      return NextResponse.json({
        success: true,
        message: "No products found to update",
        stats: { total: products.length, updated: 0, notFound, errors },
        notFoundIds: notFoundIds.slice(0, 10),
      })
    }

    const updatedProductIds = Array.from(updateMap.keys())

    // ── Cascade update ───────────────────────────────────────────────────────

    if (effDate) {
      // With effectiveDate: write ProductCostHistory + historical recalc from effDate
      for (const [productId, cost] of updateMap.entries()) {
        // Upsert history entry (same productId + effectiveDate → update, else create)
        const existing = await prisma.productCostHistory.findFirst({
          where: { productId, effectiveDate: effDate },
          select: { id: true },
        })
        if (existing) {
          await prisma.productCostHistory.update({
            where: { id: existing.id },
            data: { cost },
          })
        } else {
          await prisma.productCostHistory.create({
            data: { productId, cost, effectiveDate: effDate },
          })
        }
        // Update Product.baseCost to the latest history entry
        const latestEntry = await prisma.productCostHistory.findFirst({
          where: { productId },
          orderBy: { effectiveDate: "desc" },
          select: { cost: true },
        })
        if (latestEntry) {
          await prisma.product.update({
            where: { id: productId },
            data: { baseCost: latestEntry.cost },
          })
        }
      }

      const productIdList = Prisma.join(updatedProductIds.map((id) => Prisma.sql`${id}`))

      // Recalc OrderItem.unitCost using historical lookup (only orders >= effDate)
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
          WHERE oi2."productId" IN (${productIdList})
            AND o."orderDate" >= ${effDate}
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
          SELECT DISTINCT "orderId" FROM "OrderItem" WHERE "productId" IN (${productIdList})
        ) AND o."orderDate" >= ${effDate}
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
              / ("total" - "refundAmount") * 100, 2
            )
            ELSE 0
          END
        WHERE "id" IN (
          SELECT DISTINCT "orderId" FROM "OrderItem" WHERE "productId" IN (${productIdList})
        ) AND "orderDate" >= ${effDate}
      `)
    } else {
      // Without effectiveDate: flat overwrite baseCost + recalc all orders
      await prisma.$transaction(
        Array.from(updateMap.entries()).map(([id, baseCost]) =>
          prisma.product.update({ where: { id }, data: { baseCost } })
        )
      )

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

      const productIdList = Prisma.join(updatedProductIds.map((id) => Prisma.sql`${id}`))

      await prisma.$executeRaw(Prisma.sql`
        UPDATE "Order" o
        SET "totalCOGS" = (
          SELECT COALESCE(SUM(oi."totalCost"), 0)
          FROM "OrderItem" oi WHERE oi."orderId" = o."id"
        )
        WHERE o."id" IN (
          SELECT DISTINCT "orderId" FROM "OrderItem" WHERE "productId" IN (${productIdList})
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
              / ("total" - "refundAmount") * 100, 2
            )
            ELSE 0
          END
        WHERE "id" IN (
          SELECT DISTINCT "orderId" FROM "OrderItem" WHERE "productId" IN (${productIdList})
        )
      `)
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updateMap.size} products`,
      stats: {
        total: products.length,
        updated: updateMap.size,
        notFound,
        errors,
      },
      notFoundIds: notFoundIds.slice(0, 10),
    })
  } catch (error: any) {
    console.error("Bulk update error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to bulk update products" },
      { status: 500 }
    )
  }
}
