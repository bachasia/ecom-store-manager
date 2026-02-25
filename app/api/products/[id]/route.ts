import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"

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

    const product = await prisma.product.findFirst({
      where: {
        id: id,
        store: {
          userId: session.user.id
        }
      },
      include: {
        store: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    })

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

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

    // Verify product belongs to user
    const product = await prisma.product.findFirst({
      where: {
        id: id,
        store: {
          userId: session.user.id
        }
      }
    })

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    // Update product
    const updated = await prisma.product.update({
      where: { id: id },
      data: { baseCost }
    })

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
