import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

// GET /api/products - List products grouped by parent
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get("storeId")
    const platform = searchParams.get("platform")
    const search = searchParams.get("search")
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "50")
    const skip = (page - 1) * limit

    // Build store filter
    const storeWhere: any = { userId: session.user.id }
    if (storeId) {
      const store = await prisma.store.findFirst({ where: { id: storeId, userId: session.user.id } })
      if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 })
      storeWhere.id = storeId
    } else if (platform) {
      storeWhere.platform = platform
    }

    const userStores = await prisma.store.findMany({
      where: storeWhere,
      select: { id: true }
    })
    const storeIds = userStores.map((s) => s.id)

    if (storeIds.length === 0) {
      return NextResponse.json({
        products: [],
        pagination: { page, limit, total: 0, totalPages: 0 }
      })
    }

    const searchTerm = search?.trim() ?? ""
    const hasSearch = searchTerm.length > 0
    const likeParam = `%${searchTerm}%`

    const storeIdsSql = Prisma.join(storeIds.map((id) => Prisma.sql`${id}`))
    const searchSql = hasSearch
      ? Prisma.sql`AND (p."name" ILIKE ${likeParam} OR p."sku" ILIKE ${likeParam})`
      : Prisma.empty

    const groupedSubquery = Prisma.sql`
      SELECT
        p."storeId" AS "storeId",
        p."parentExternalId" AS "parentExternalId",
        CASE WHEN p."parentExternalId" IS NULL THEN p."id" ELSE NULL END AS "simpleId",
        MIN(p."name") AS "sortName",
        MIN(COALESCE(p."variantName", '')) AS "sortVariant"
      FROM "Product" p
      WHERE p."storeId" IN (${storeIdsSql})
      ${searchSql}
      GROUP BY
        p."storeId",
        p."parentExternalId",
        CASE WHEN p."parentExternalId" IS NULL THEN p."id" ELSE NULL END
    `

    const totalRows = await prisma.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM (${groupedSubquery}) g
    `)
    const total = Number(totalRows[0]?.total ?? 0)

    const pagedGroups = await prisma.$queryRaw<Array<{
      storeId: string
      parentExternalId: string | null
      simpleId: string | null
    }>>(Prisma.sql`
      SELECT g."storeId", g."parentExternalId", g."simpleId"
      FROM (${groupedSubquery}) g
      ORDER BY g."sortName" ASC, g."sortVariant" ASC
      OFFSET ${skip}
      LIMIT ${limit}
    `)

    if (pagedGroups.length === 0) {
      return NextResponse.json({
        products: [],
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      })
    }

    const groupFilters = pagedGroups.map((g) =>
      g.parentExternalId
        ? { storeId: g.storeId, parentExternalId: g.parentExternalId }
        : { id: g.simpleId! }
    )

    const productWhere: any = {
      storeId: { in: storeIds },
      OR: groupFilters,
    }

    const allProducts = await prisma.product.findMany({
      where: productWhere,
      include: {
        store: { select: { id: true, name: true, platform: true } },
        _count: { select: { orderItems: true } }
      },
      orderBy: [
        { name: "asc" },
        { variantName: "asc" },
      ],
    })

    // ── Group: parentExternalId có giá trị → product có variants
    //           parentExternalId null → simple product (1 row = 1 group)
    type ProductRow = typeof allProducts[number]

    interface ProductGroup {
      // Thông tin hiển thị ở row cha
      id: string           // id của row đầu tiên (hoặc row duy nhất)
      storeId: string
      parentExternalId: string | null
      name: string
      imageUrl: string | null
      isActive: boolean
      store: ProductRow['store']
      // Tổng hợp từ tất cả variants
      priceMin: number
      priceMax: number
      totalOrderItems: number
      // Variants con (nếu có nhiều hơn 1)
      variants: ProductRow[]
      // Nếu chỉ có 1 (simple product hoặc single-variant)
      sku: string | null
      variantName: string | null
      baseCost: number
      price: number
    }

    // Map: key → group
    // Key = `${storeId}::${parentExternalId}` cho products có variants
    //     = `${storeId}::simple::${id}` cho simple products
    const groupMap = new Map<string, ProductGroup>()

    for (const p of allProducts) {
      const isVariant = p.parentExternalId !== null
      const key = isVariant
        ? `${p.storeId}::${p.parentExternalId}`
        : `${p.storeId}::simple::${p.id}`

      const existing = groupMap.get(key)
      const price = parseFloat(p.price.toString())

      if (existing) {
        existing.variants.push(p)
        existing.totalOrderItems += p._count.orderItems
        if (price < existing.priceMin) existing.priceMin = price
        if (price > existing.priceMax) existing.priceMax = price
        // Nếu group chưa có ảnh, lấy ảnh của variant này
        if (!existing.imageUrl && p.imageUrl) existing.imageUrl = p.imageUrl
      } else {
        groupMap.set(key, {
          id: p.id,
          storeId: p.storeId,
          parentExternalId: p.parentExternalId,
          name: p.name,
          imageUrl: p.imageUrl,
          isActive: p.isActive,
          store: p.store,
          priceMin: price,
          priceMax: price,
          totalOrderItems: p._count.orderItems,
          variants: [p],
          sku: p.sku,
          variantName: p.variantName,
          baseCost: parseFloat(p.baseCost.toString()),
          price,
        })
      }
    }

    const groups = Array.from(groupMap.values())
    const paginated = groups

    return NextResponse.json({
      products: paginated,
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

    const productIds = updates.map((u: any) => u.id)
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, store: { userId: session.user.id } },
      select: { id: true }
    })

    if (products.length !== productIds.length) {
      return NextResponse.json({ error: "Some products not found or unauthorized" }, { status: 403 })
    }

    let updated = 0
    for (const update of updates) {
      await prisma.product.update({
        where: { id: update.id },
        data: { baseCost: update.baseCost }
      })
      updated++
    }

    return NextResponse.json({ success: true, message: `Updated ${updated} products`, updated })

  } catch (error: any) {
    console.error("Bulk update products error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to update products" },
      { status: 500 }
    )
  }
}
