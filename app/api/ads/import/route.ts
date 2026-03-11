import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { calculateOrderPL } from "@/lib/calculations/pnl"
import { allocateAdsCosts } from "@/lib/calculations/ads-allocation"
import { requireStorePermission } from "@/lib/permissions"
import { getUserTimezone } from "@/lib/utils/timezone"
import { parseDateOnlyToUTC } from "@/lib/utils/date-only"

// POST /api/ads/import - Bulk import ads costs
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { storeId, platform, data } = await req.json()

    // Verify store permission (manage_ads)
    const denied = await requireStorePermission(session.user.id, storeId, 'manage_ads')
    if (denied) return denied

    // Verify store exists
    const store = await prisma.store.findUnique({
      where: { id: storeId }
    })

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    let imported = 0
    let errors = 0
    const timezone = await getUserTimezone(session.user.id)

    for (const row of data) {
      try {
        const adsDate = parseDateOnlyToUTC(row.date)

        await prisma.adsCost.upsert({
          where: {
            storeId_date_platform_accountName_campaignName_adsetName: {
              storeId,
              date: adsDate,
              platform,
              accountName: "",
              campaignName: row.campaignName || "",
              adsetName: row.adsetName || "",
            }
          },
          update: {
            spend: row.spend,
            impressions: row.impressions ?? null,
            clicks: row.clicks ?? null,
          },
          create: {
            storeId,
            date: adsDate,
            platform,
            campaignName: row.campaignName || "",
            adsetName: row.adsetName || "",
            spend: row.spend,
            impressions: row.impressions ?? null,
            clicks: row.clicks ?? null,
          }
        })
        imported++
      } catch (error) {
        console.error("Error importing row:", error)
        errors++
      }
    }

    // Auto-recalculate P&L: allocate the imported ads costs to orders
    try {
      const orders = await prisma.order.findMany({
        where: { storeId },
        select: {
          id: true,
          storeId: true,
          orderDate: true,
          total: true,
          refundAmount: true,
          totalCOGS: true,
          transactionFee: true,
          allocatedAdsCost: true,
        }
      })

      if (orders.length > 0) {
        const allAdsCosts = await prisma.adsCost.findMany({
          where: { storeId },
          select: {
            id: true,
            storeId: true,
            date: true,
            platform: true,
            campaignName: true,
            adsetName: true,
            spend: true,
          }
        })

        // Build a lookup map for O(1) access instead of O(n) find per order
        const ordersById = new Map(orders.map(o => [o.id, o]))

        const ordersWithAllocatedAds = allocateAdsCosts(
          orders.map(o => ({
            ...o,
            total: Number(o.total),
            refundAmount: Number(o.refundAmount),
            totalCOGS: Number(o.totalCOGS),
            transactionFee: Number(o.transactionFee),
            allocatedAdsCost: Number(o.allocatedAdsCost),
          })),
          allAdsCosts.map(a => ({ ...a, spend: Number(a.spend) })),
          "revenue-weighted",
          timezone
        )

        // Build all updates in memory, then flush in a single transaction
        const updates = ordersWithAllocatedAds.flatMap(allocatedOrder => {
          const originalOrder = ordersById.get(allocatedOrder.id)
          if (!originalOrder) return []

          const pl = calculateOrderPL({
            id: allocatedOrder.id,
            total: Number(originalOrder.total),
            refundAmount: Number(originalOrder.refundAmount),
            vendorRefundAmount: Number((originalOrder as any).vendorRefundAmount ?? 0),
            totalCOGS: Number(originalOrder.totalCOGS),
            transactionFee: Number(originalOrder.transactionFee),
            allocatedAdsCost: allocatedOrder.allocatedAdsCost || 0,
          })

          return [prisma.order.update({
            where: { id: allocatedOrder.id },
            data: {
              allocatedAdsCost: allocatedOrder.allocatedAdsCost || 0,
              grossProfit: pl.grossProfit,
              netProfit: pl.netProfit,
              profitMargin: pl.profitMargin,
            }
          })]
        })

        await prisma.$transaction(updates)
      }
    } catch (recalcError) {
      console.error("Auto-recalculate error after ads import:", recalcError)
      // Non-fatal: import succeeded, recalc failed — still return success
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
