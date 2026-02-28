import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { requireStorePermission } from "@/lib/permissions"

const EXPORT_LIMIT = 50_000

// GET /api/products/export?storeId=xxx&search=yyy&filter=no_cogs|has_sold|no_sold
// Streams a CSV file: sku,name,variantName,price,baseCost
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const storeId = searchParams.get("storeId")
  const search  = searchParams.get("search")?.trim() ?? ""
  const filter  = searchParams.get("filter") ?? "" // "no_cogs" | "has_sold" | "no_sold"

  if (!storeId) {
    return new Response(JSON.stringify({ error: "storeId is required" }), { status: 400 })
  }

  // Verify store permission (view_products)
  const denied = await requireStorePermission(session.user.id, storeId, 'view_products')
  if (denied) return denied

  // Verify store exists
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, name: true },
  })
  if (!store) {
    return new Response(JSON.stringify({ error: "Store not found" }), { status: 404 })
  }

  // Build Prisma where — dùng raw SQL cho filter has_sold / no_sold vì cần JOIN OrderItem
  // Với search + no_cogs ta dùng Prisma ORM where thông thường
  const hasSearch = search.length > 0

  // Lấy IDs thoả filter trước (nếu has_sold / no_sold) rồi dùng id IN (...)
  // để batch fetch vẫn hoạt động đúng
  let filteredIds: string[] | null = null // null = không filter by id

  if (filter === "has_sold" || filter === "no_sold") {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(
      filter === "has_sold"
        ? Prisma.sql`
            SELECT p."id"
            FROM "Product" p
            WHERE p."storeId" = ${storeId}
              AND p."isActive" = true
              ${hasSearch ? Prisma.sql`AND (p."name" ILIKE ${`%${search}%`} OR p."sku" ILIKE ${`%${search}%`})` : Prisma.empty}
              AND EXISTS (
                SELECT 1 FROM "OrderItem" oi WHERE oi."productId" = p."id"
              )
          `
        : Prisma.sql`
            SELECT p."id"
            FROM "Product" p
            WHERE p."storeId" = ${storeId}
              AND p."isActive" = true
              ${hasSearch ? Prisma.sql`AND (p."name" ILIKE ${`%${search}%`} OR p."sku" ILIKE ${`%${search}%`})` : Prisma.empty}
              AND NOT EXISTS (
                SELECT 1 FROM "OrderItem" oi WHERE oi."productId" = p."id"
              )
          `
    )
    filteredIds = rows.map((r) => r.id)
  }

  // Prisma where
  const where: Prisma.ProductWhereInput = {
    isActive: true,
    ...(filteredIds !== null
      ? { id: { in: filteredIds } }
      : { storeId }),
    ...(filter === "no_cogs" && { baseCost: 0 }),
    ...(hasSearch && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { sku:  { contains: search, mode: "insensitive" } },
      ],
    }),
  }

  // Stream CSV via ReadableStream
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode("sku,name,variantName,price,baseCost\n"))

      const BATCH = 500
      let skip = 0
      let fetched = 0

      while (fetched < EXPORT_LIMIT) {
        const rows = await prisma.product.findMany({
          where,
          select: {
            sku: true,
            name: true,
            variantName: true,
            price: true,
            baseCost: true,
          },
          orderBy: [{ name: "asc" }, { variantName: "asc" }],
          skip,
          take: BATCH,
        })

        if (rows.length === 0) break

        for (const r of rows) {
          const sku         = escapeCsv(r.sku)
          const name        = escapeCsv(r.name)
          const variantName = escapeCsv(r.variantName ?? "")
          const price       = Number(r.price).toFixed(2)
          const baseCost    = Number(r.baseCost).toFixed(2)
          controller.enqueue(encoder.encode(`${sku},${name},${variantName},${price},${baseCost}\n`))
        }

        fetched += rows.length
        skip    += BATCH

        if (rows.length < BATCH) break
      }

      controller.close()
    },
  })

  const storeName = store.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()
  const date      = new Date().toISOString().slice(0, 10)
  const suffix    = filter ? `_${filter}` : ""
  const filename  = `products_${storeName}${suffix}_${date}.csv`

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  })
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
