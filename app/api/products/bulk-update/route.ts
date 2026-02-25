import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"

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

    let updated = 0
    let notFound = 0
    let errors = 0
    const notFoundSkus: string[] = []

    for (const item of products) {
      try {
        const { sku, baseCost } = item

        if (!sku || baseCost === undefined || baseCost < 0) {
          errors++
          continue
        }

        // Find product by SKU and store
        const product = await prisma.product.findFirst({
          where: {
            storeId: storeId,
            sku: sku
          }
        })

        if (!product) {
          notFound++
          notFoundSkus.push(sku)
          continue
        }

        // Update base cost
        await prisma.product.update({
          where: { id: product.id },
          data: { baseCost: parseFloat(baseCost) }
        })

        updated++
      } catch (error) {
        console.error(`Error updating SKU ${item.sku}:`, error)
        errors++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updated} products`,
      stats: {
        total: products.length,
        updated,
        notFound,
        errors
      },
      notFoundSkus: notFoundSkus.slice(0, 10) // Return first 10 not found SKUs
    })

  } catch (error: any) {
    console.error("Bulk update error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to bulk update products" },
      { status: 500 }
    )
  }
}
