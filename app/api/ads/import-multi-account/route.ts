import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { requireStorePermission, getStoreIdsWithPermission } from "@/lib/permissions"
import { convertToUSD } from "@/lib/utils/currency"
import { calculateOrderPL } from "@/lib/calculations/pnl"
import { allocateAdsCosts } from "@/lib/calculations/ads-allocation"
import type { MultiAccountAdsRow } from "@/lib/parsers/multi-account-ads"
import { getUserTimezone } from "@/lib/utils/timezone"
import { parseDateOnlyToUTC } from "@/lib/utils/date-only"

const rowSchema = z.object({
  accountName: z.string().min(1),
  date: z.string().min(1),
  currency: z.string().default("USD"),
  spend: z.number().min(0),
  originalSpend: z.number().optional(),
  exchangeRate: z.number().optional(),
  ctr: z.number().optional(),
  cpm: z.number().optional(),
  purchases: z.number().int().optional(),
  costPerPurchase: z.number().optional(),
  purchaseValue: z.number().optional(),
  cpc: z.number().optional(),
})

const bodySchema = z.object({
  rows: z.array(rowSchema),
  // storeId override: nếu truyền vào, toàn bộ rows sẽ import vào store này bất kể mapping
  storeIdOverride: z.string().optional(),
})

/**
 * POST /api/ads/import-multi-account
 *
 * Logic:
 * 1. Lấy tất cả AdsAccountMapping (facebook) mà user có quyền manage_ads
 * 2. Với mỗi row: tìm storeId từ mapping theo accountName
 *    - Nếu storeIdOverride được truyền → dùng luôn storeId đó cho tất cả
 * 3. Convert currency → USD nếu cần
 * 4. Upsert AdsCost
 * 5. Recalculate P&L cho các stores bị ảnh hưởng
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { rows, storeIdOverride } = bodySchema.parse(body)
    const timezone = await getUserTimezone(session.user.id)

    if (rows.length === 0) {
      return NextResponse.json({ error: "No data rows provided" }, { status: 400 })
    }

    // Lấy danh sách stores user có quyền manage_ads
    const accessibleStoreIds = await getStoreIdsWithPermission(session.user.id, "manage_ads")

    // Nếu có storeIdOverride, kiểm tra quyền ngay
    if (storeIdOverride) {
      const denied = await requireStorePermission(session.user.id, storeIdOverride, "manage_ads")
      if (denied) return denied
    }

    // Lấy tất cả mappings của các stores mà user quản lý
    const allMappings = await prisma.adsAccountMapping.findMany({
      where: {
        platform: "facebook",
        storeId: { in: accessibleStoreIds },
      },
      select: { accountName: true, storeId: true },
    })

    // Build lookup map: accountName (lowercase) → storeId
    const accountToStore = new Map<string, string>()
    for (const m of allMappings) {
      accountToStore.set(m.accountName.toLowerCase().trim(), m.storeId)
    }

    // Tracking kết quả
    let imported = 0
    let skippedNoMapping = 0
    let errors = 0
    const affectedStoreIds = new Set<string>()
    const unmappedAccounts = new Set<string>()

    // Cache exchange rates để tránh gọi API nhiều lần
    const exchangeRateCache = new Map<string, number>()

    for (const row of rows) {
      try {
        // Xác định storeId
        let targetStoreId: string | undefined = storeIdOverride

        if (!targetStoreId) {
          targetStoreId = accountToStore.get(row.accountName.toLowerCase().trim())
        }

        if (!targetStoreId) {
          unmappedAccounts.add(row.accountName)
          skippedNoMapping++
          continue
        }

        // Verify store accessible
        if (!accessibleStoreIds.includes(targetStoreId)) {
          skippedNoMapping++
          continue
        }

        // Convert currency nếu cần
        let finalSpend = row.spend
        let finalExchangeRate = row.exchangeRate
        let finalOriginalSpend = row.originalSpend

        if (row.currency !== "USD" && !row.exchangeRate) {
          // Chưa có exchange rate — cần convert
          const cacheKey = row.currency
          let rate = exchangeRateCache.get(cacheKey)
          if (!rate) {
            const converted = await convertToUSD(row.spend, row.currency)
            rate = converted.exchangeRate
            exchangeRateCache.set(cacheKey, rate)
          }
          finalOriginalSpend = row.spend
          finalExchangeRate = rate
          finalSpend = parseFloat((row.spend * rate).toFixed(2))
        }

        // Upsert AdsCost — update luôn overwrite toàn bộ fields
        // (dùng null thay vì bỏ qua để xóa giá trị cũ khi file mới không có cột đó)
        const adsDate = parseDateOnlyToUTC(row.date)

        await prisma.adsCost.upsert({
          where: {
            storeId_date_platform_accountName_campaignName_adsetName: {
              storeId: targetStoreId,
              date: adsDate,
              platform: "facebook",
              accountName: row.accountName,
              campaignName: "",
              adsetName: "",
            },
          },
          update: {
            currency: row.currency,
            spend: finalSpend,
            originalSpend: finalOriginalSpend ?? null,
            exchangeRate: finalExchangeRate ?? null,
            ctr: row.ctr ?? null,
            cpm: row.cpm ?? null,
            purchases: row.purchases ?? null,
            costPerPurchase: row.costPerPurchase ?? null,
            purchaseValue: row.purchaseValue ?? null,
            cpc: row.cpc ?? null,
          },
          create: {
            storeId: targetStoreId,
            date: adsDate,
            platform: "facebook",
            accountName: row.accountName,
            campaignName: "",
            adsetName: "",
            currency: row.currency,
            spend: finalSpend,
            ...(finalOriginalSpend !== undefined && { originalSpend: finalOriginalSpend }),
            ...(finalExchangeRate !== undefined && { exchangeRate: finalExchangeRate }),
            ...(row.ctr !== undefined && { ctr: row.ctr }),
            ...(row.cpm !== undefined && { cpm: row.cpm }),
            ...(row.purchases !== undefined && { purchases: row.purchases }),
            ...(row.costPerPurchase !== undefined && { costPerPurchase: row.costPerPurchase }),
            ...(row.purchaseValue !== undefined && { purchaseValue: row.purchaseValue }),
            ...(row.cpc !== undefined && { cpc: row.cpc }),
          },
        })

        affectedStoreIds.add(targetStoreId)
        imported++
      } catch (err) {
        console.error("Error importing row:", row.accountName, row.date, err)
        errors++
      }
    }

    // Recalculate P&L cho tất cả stores bị ảnh hưởng
    const recalcErrors: string[] = []
    for (const storeId of affectedStoreIds) {
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
          },
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
            },
          })

          const ordersById = new Map(orders.map((o) => [o.id, o]))
          const ordersWithAllocatedAds = allocateAdsCosts(
            orders.map((o) => ({
              ...o,
              total: Number(o.total),
              refundAmount: Number(o.refundAmount),
              totalCOGS: Number(o.totalCOGS),
              transactionFee: Number(o.transactionFee),
              allocatedAdsCost: Number(o.allocatedAdsCost),
            })),
            allAdsCosts.map((a) => ({ ...a, spend: Number(a.spend) })),
            "revenue-weighted",
            timezone
          )

          const updates = ordersWithAllocatedAds.flatMap((allocatedOrder) => {
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

            return [
              prisma.order.update({
                where: { id: allocatedOrder.id },
                data: {
                  allocatedAdsCost: allocatedOrder.allocatedAdsCost || 0,
                  grossProfit: pl.grossProfit,
                  netProfit: pl.netProfit,
                  profitMargin: pl.profitMargin,
                },
              }),
            ]
          })

          await prisma.$transaction(updates)
        }
      } catch (recalcErr) {
        console.error(`Recalc P&L error for store ${storeId}:`, recalcErr)
        recalcErrors.push(storeId)
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skippedNoMapping,
      errors,
      affectedStores: Array.from(affectedStoreIds).length,
      unmappedAccounts: Array.from(unmappedAccounts),
      recalcErrors: recalcErrors.length > 0 ? recalcErrors : undefined,
      message: `Imported ${imported} records into ${affectedStoreIds.size} store(s).${
        skippedNoMapping > 0
          ? ` ${skippedNoMapping} rows skipped (no mapping found for: ${Array.from(unmappedAccounts).join(", ")}).`
          : ""
      }`,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error("POST /api/ads/import-multi-account error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
