import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { getStoreIdsWithPermission, requireStorePermission } from "@/lib/permissions"

const adsCostSchema = z.object({
  storeId: z.string(),
  date: z.string(),
  platform: z.enum(["facebook", "google", "manual"]),
  campaignName: z.string().optional(),
  adsetName: z.string().optional(),
  spend: z.number().min(0),
  impressions: z.number().int().min(0).optional(),
  clicks: z.number().int().min(0).optional(),
})

// GET /api/ads - List ads costs
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get("storeId")
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    const where: any = {}

    if (storeId) {
      // Verify user has access to this store
      const denied = await requireStorePermission(session.user.id, storeId, 'view_dashboard')
      if (denied) return denied
      where.storeId = storeId
    } else {
      // Get all accessible stores
      const stores = await getStoreIdsWithPermission(session.user.id, 'view_dashboard')
      where.storeId = { in: stores }
    }

    if (from) {
      where.date = { ...where.date, gte: new Date(from) }
    }
    if (to) {
      where.date = { ...where.date, lte: new Date(to) }
    }

    const adsCosts = await prisma.adsCost.findMany({
      where,
      include: {
        store: {
          select: {
            id: true,
            name: true,
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    })

    return NextResponse.json({ adsCosts })
  } catch (error) {
    console.error("Get ads costs error:", error)
    return NextResponse.json(
      { error: "An error occurred while fetching ads costs" },
      { status: 500 }
    )
  }
}

// POST /api/ads - Create ads cost (manual or import)
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validatedData = adsCostSchema.parse(body)

    // Verify user has manage_ads permission on this store
    const denied = await requireStorePermission(session.user.id, validatedData.storeId, 'manage_ads')
    if (denied) return denied

    const adsCost = await prisma.adsCost.create({
      data: {
        storeId: validatedData.storeId,
        date: new Date(validatedData.date),
        platform: validatedData.platform,
        campaignName: validatedData.campaignName || "",
        adsetName: validatedData.adsetName || "",
        spend: validatedData.spend,
        impressions: validatedData.impressions || null,
        clicks: validatedData.clicks || null,
      }
    })

    return NextResponse.json({ adsCost }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      )
    }

    console.error("Create ads cost error:", error)
    return NextResponse.json(
      { error: "An error occurred while creating ads cost" },
      { status: 500 }
    )
  }
}
