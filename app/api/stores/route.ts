import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { encrypt, decrypt } from "@/lib/encryption"
import { z } from "zod"

const storeSchema = z.object({
  name: z.string().min(1, "Store name is required"),
  platform: z.enum(["shopbase", "woocommerce"]),
  apiUrl: z.string().url("Invalid URL"),
  apiKey: z.string().min(1, "API Key is required"),
  apiSecret: z.string().optional(),
  pluginSecret: z.string().optional(),
  currency: z.string().default("USD"),
  timezone: z.string().default("UTC"),
}).refine(
  (data) => data.platform === 'shopbase' ? !!data.apiSecret?.trim() : true,
  { message: "API Password is required for ShopBase", path: ["apiSecret"] }
).refine(
  (data) => data.platform === 'woocommerce' ? !!data.apiSecret?.trim() : true,
  { message: "Consumer Secret is required for WooCommerce", path: ["apiSecret"] }
)

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
        pluginSecret: true,  // used to compute hasPlugin — not returned to client
        _count: {
          select: {
            products: true,
            orders: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    const storeIds = stores.map((store) => store.id)
    let parentProductCountByStore = new Map<string, number>()
    let runningSyncStoreIds = new Set<string>()

    if (storeIds.length > 0) {
      const rows = await prisma.$queryRaw<Array<{ storeId: string; productCount: bigint | number }>>(
        Prisma.sql`
          SELECT
            "storeId",
            COUNT(DISTINCT COALESCE("parentExternalId", "externalId")) AS "productCount"
          FROM "Product"
          WHERE "storeId" IN (${Prisma.join(storeIds)})
          GROUP BY "storeId"
        `
      )

      parentProductCountByStore = new Map(
        rows.map((row) => [row.storeId, Number(row.productCount)])
      )

      const runningLogs = await prisma.syncLog.groupBy({
        by: ['storeId'],
        where: {
          storeId: { in: storeIds },
          status: 'started',
          completedAt: null,
        },
      })

      runningSyncStoreIds = new Set(runningLogs.map((log) => log.storeId))

      const staleSyncStoreIds = stores
        .filter((s) => (s.lastSyncStatus === 'in_progress' || s.lastSyncStatus === 'cancelling') && !runningSyncStoreIds.has(s.id))
        .map((s) => s.id)

      if (staleSyncStoreIds.length > 0) {
        await prisma.store.updateMany({
          where: { id: { in: staleSyncStoreIds } },
          data: {
            lastSyncStatus: null,
            lastSyncError: null,
          }
        })
      }
    }

    const storesWithParentProductCount = stores.map((store) => {
      const { pluginSecret, ...storeWithoutSecret } = store as any
      return {
        ...storeWithoutSecret,
        lastSyncStatus:
          (store.lastSyncStatus === 'in_progress' || store.lastSyncStatus === 'cancelling') && !runningSyncStoreIds.has(store.id)
            ? null
            : store.lastSyncStatus,
        productCount: parentProductCountByStore.get(store.id) ?? 0,
        hasPlugin: !!pluginSecret,
      }
    })

    return NextResponse.json({ stores: storesWithParentProductCount })
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

    const tzSetting = await prisma.appSetting.findUnique({
      where: { key: `default_timezone:${session.user.id}` }
    })
    const effectiveTimezone = tzSetting?.value || validatedData.timezone || "UTC"

    // Encrypt API credentials
    const encryptedApiKey = encrypt(validatedData.apiKey)
    const encryptedApiSecret = validatedData.apiSecret
      ? encrypt(validatedData.apiSecret)
      : null
    const encryptedPluginSecret = validatedData.pluginSecret?.trim()
      ? encrypt(validatedData.pluginSecret.trim())
      : null

    const store = await prisma.store.create({
      data: {
        userId: session.user.id,
        name: validatedData.name,
        platform: validatedData.platform,
        apiUrl: validatedData.apiUrl,
        apiKey: encryptedApiKey,
        apiSecret: encryptedApiSecret,
        pluginSecret: encryptedPluginSecret,
        currency: validatedData.currency,
        timezone: effectiveTimezone,
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
