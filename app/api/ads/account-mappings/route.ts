import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { requireStorePermission, getStoreIdsWithPermission } from "@/lib/permissions"

const createSchema = z.object({
  storeId: z.string().min(1),
  accountName: z.string().min(1, "Account name is required"),
  platform: z.string().default("facebook"),
  description: z.string().optional(),
})

// GET /api/ads/account-mappings?storeId=xxx
// Trả về tất cả mappings của store (hoặc tất cả stores accessible nếu không truyền storeId)
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get("storeId")

    // Lấy danh sách store IDs mà user có quyền view
    const accessibleStoreIds = await getStoreIdsWithPermission(session.user.id, "view_dashboard")

    const where = storeId
      ? { storeId, id: { in: accessibleStoreIds } }
      : { storeId: { in: accessibleStoreIds } }

    const mappings = await prisma.adsAccountMapping.findMany({
      where,
      include: {
        store: { select: { id: true, name: true, platform: true } },
      },
      orderBy: [{ storeId: "asc" }, { accountName: "asc" }],
    })

    return NextResponse.json({ mappings })
  } catch (error) {
    console.error("GET /api/ads/account-mappings error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/ads/account-mappings
// Tạo mới một mapping
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const data = createSchema.parse(body)

    // Kiểm tra quyền manage_ads trên store
    const denied = await requireStorePermission(session.user.id, data.storeId, "manage_ads")
    if (denied) return denied

    // Kiểm tra store tồn tại
    const store = await prisma.store.findUnique({ where: { id: data.storeId } })
    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    // Kiểm tra accountName có đang được map cho store khác không
    const existing = await prisma.adsAccountMapping.findUnique({
      where: {
        platform_accountName: {
          platform: data.platform,
          accountName: data.accountName,
        },
      },
      include: { store: { select: { name: true } } },
    })

    if (existing) {
      return NextResponse.json(
        {
          error: `Account "${data.accountName}" đã được map vào store "${existing.store.name}". Mỗi account chỉ có thể thuộc về 1 store.`,
        },
        { status: 409 }
      )
    }

    const mapping = await prisma.adsAccountMapping.create({
      data: {
        storeId: data.storeId,
        accountName: data.accountName,
        platform: data.platform,
        description: data.description,
      },
      include: {
        store: { select: { id: true, name: true, platform: true } },
      },
    })

    return NextResponse.json({ mapping }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error("POST /api/ads/account-mappings error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
