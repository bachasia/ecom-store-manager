import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { encrypt, decrypt } from "@/lib/encryption"
import { z } from "zod"

const storeSchema = z.object({
  name: z.string().min(1, "Store name is required"),
  platform: z.enum(["shopbase", "woocommerce"]),
  apiUrl: z.string().url("Invalid URL"),
  apiKey: z.string().min(1, "API Key is required"),
  apiSecret: z.string().optional(),
  currency: z.string().default("USD"),
  timezone: z.string().default("UTC"),
})

// GET /api/stores - List all stores for current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const stores = await prisma.store.findMany({
      where: {
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
        // Don't return encrypted credentials
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({ stores })
  } catch (error) {
    console.error("Get stores error:", error)
    return NextResponse.json(
      { error: "An error occurred while fetching stores" },
      { status: 500 }
    )
  }
}

// POST /api/stores - Create new store
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validatedData = storeSchema.parse(body)

    // Encrypt API credentials
    const encryptedApiKey = encrypt(validatedData.apiKey)
    const encryptedApiSecret = validatedData.apiSecret 
      ? encrypt(validatedData.apiSecret) 
      : null

    const store = await prisma.store.create({
      data: {
        userId: session.user.id,
        name: validatedData.name,
        platform: validatedData.platform,
        apiUrl: validatedData.apiUrl,
        apiKey: encryptedApiKey,
        apiSecret: encryptedApiSecret,
        currency: validatedData.currency,
        timezone: validatedData.timezone,
      },
      select: {
        id: true,
        name: true,
        platform: true,
        apiUrl: true,
        isActive: true,
        currency: true,
        timezone: true,
        createdAt: true,
      }
    })

    return NextResponse.json({ store }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      )
    }

    console.error("Create store error:", error)
    return NextResponse.json(
      { error: "An error occurred while creating store" },
      { status: 500 }
    )
  }
}
