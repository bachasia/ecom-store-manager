import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { encrypt, decrypt } from "@/lib/encryption"
import { z } from "zod"

const updateStoreSchema = z.object({
  name: z.string().min(1, "Store name is required").optional(),
  platform: z.enum(["shopbase", "woocommerce"]).optional(),
  apiUrl: z.string().url("Invalid URL").optional(),
  apiKey: z.string().min(1, "API Key is required").optional(),
  apiSecret: z.string().optional(),
  pluginSecret: z.string().optional(),
  currency: z.string().optional(),
  timezone: z.string().optional(),
  isActive: z.boolean().optional(),
})

// GET /api/stores/[id] - Get single store
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

    const store = await prisma.store.findFirst({
      where: {
        id: id,
        userId: session.user.id
      },
      select: {
        id: true,
        name: true,
        platform: true,
        apiUrl: true,
        isActive: true,
        currency: true,
        timezone: true,
        lastSyncAt: true,
        lastSyncStatus: true,
        lastSyncError: true,
        createdAt: true,
        updatedAt: true,
      }
    })

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    return NextResponse.json({ store })
  } catch (error) {
    console.error("Get store error:", error)
    return NextResponse.json(
      { error: "An error occurred while fetching store" },
      { status: 500 }
    )
  }
}

// PUT /api/stores/[id] - Update store
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
    const validatedData = updateStoreSchema.parse(body)

    // Check if store exists and belongs to user
    const existingStore = await prisma.store.findFirst({
      where: {
        id: id,
        userId: session.user.id
      }
    })

    if (!existingStore) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    // Prepare update data
    const updateData: any = {}
    
    if (validatedData.name) updateData.name = validatedData.name
    if (validatedData.platform) updateData.platform = validatedData.platform
    if (validatedData.apiUrl) updateData.apiUrl = validatedData.apiUrl
    if (validatedData.currency) updateData.currency = validatedData.currency
    if (validatedData.timezone) updateData.timezone = validatedData.timezone
    if (typeof validatedData.isActive === 'boolean') updateData.isActive = validatedData.isActive
    
    // Encrypt new credentials if provided
    if (validatedData.apiKey) {
      updateData.apiKey = encrypt(validatedData.apiKey)
    }
    if (validatedData.apiSecret) {
      updateData.apiSecret = encrypt(validatedData.apiSecret)
    }
    if (typeof validatedData.pluginSecret === 'string') {
      // Empty string = remove plugin secret; non-empty = set new secret
      updateData.pluginSecret = validatedData.pluginSecret.trim()
        ? encrypt(validatedData.pluginSecret.trim())
        : null
    }

    const store = await prisma.store.update({
      where: { id: id },
      data: updateData,
      select: {
        id: true,
        name: true,
        platform: true,
        apiUrl: true,
        isActive: true,
        currency: true,
        timezone: true,
        updatedAt: true,
      }
    })

    return NextResponse.json({ store })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      )
    }

    console.error("Update store error:", error)
    return NextResponse.json(
      { error: "An error occurred while updating store" },
      { status: 500 }
    )
  }
}

// DELETE /api/stores/[id] - Delete store
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

    // Check if store exists and belongs to user
    const existingStore = await prisma.store.findFirst({
      where: {
        id: id,
        userId: session.user.id
      }
    })

    if (!existingStore) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    await prisma.store.delete({
      where: { id: id }
    })

    return NextResponse.json({ message: "Store deleted successfully" })
  } catch (error) {
    console.error("Delete store error:", error)
    return NextResponse.json(
      { error: "An error occurred while deleting store" },
      { status: 500 }
    )
  }
}
