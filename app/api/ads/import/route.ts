import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"

// POST /api/ads/import - Bulk import ads costs
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { storeId, platform, data } = await req.json()

    // Verify user owns this store
    const store = await prisma.store.findFirst({
      where: {
        id: storeId,
        userId: session.user.id
      }
    })

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    let imported = 0
    let errors = 0

    for (const row of data) {
      try {
        await prisma.adsCost.upsert({
          where: {
            storeId_date_platform_campaignName_adsetName: {
              storeId,
              date: new Date(row.date),
              platform,
              campaignName: row.campaignName || null,
              adsetName: row.adsetName || null,
            }
          },
          update: {
            spend: row.spend,
            impressions: row.impressions || null,
            clicks: row.clicks || null,
          },
          create: {
            storeId,
            date: new Date(row.date),
            platform,
            campaignName: row.campaignName || null,
            adsetName: row.adsetName || null,
            spend: row.spend,
            impressions: row.impressions || null,
            clicks: row.clicks || null,
          }
        })
        imported++
      } catch (error) {
        console.error("Error importing row:", error)
        errors++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Imported ${imported} records (${errors} errors)`,
      imported,
      errors,
    })
  } catch (error) {
    console.error("Import ads cost error:", error)
    return NextResponse.json(
      { error: "An error occurred while importing ads costs" },
      { status: 500 }
    )
  }
}
