import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { calculateTransactionFee } from "@/lib/calculations/transaction-fee"
import { calculateOrderPL } from "@/lib/calculations/pnl"
import { z } from "zod"

const applySchema = z.object({
  storeId: z.string().optional(),
})

const normalizeGatewayKey = (value: string | null | undefined): string =>
  (value || "").toLowerCase().replace(/[^a-z0-9]/g, "")

// POST /api/settings/gateways/[id]/apply
// Re-apply gateway matching rules to existing orders (optionally for one store)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const { storeId } = applySchema.parse(body)

    const gateway = await prisma.paymentGateway.findUnique({ where: { id } })
    if (!gateway) {
      return NextResponse.json({ error: "Gateway not found" }, { status: 404 })
    }

    // Target stores: one store or all user stores
    const userStores = await prisma.store.findMany({
      where: {
        userId: session.user.id,
        ...(storeId ? { id: storeId } : {}),
      },
      select: { id: true, name: true },
    })

    if (userStores.length === 0) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    const storeIds = userStores.map((s) => s.id)

    const activeGateways = await prisma.paymentGateway.findMany({
      where: { isActive: true },
    })

    const gatewaysByName = new Map<string, (typeof activeGateways)[number]>()
    const gatewaysByDisplayName = new Map<string, (typeof activeGateways)[number]>()
    const gatewaysByKeyword = new Map<string, (typeof activeGateways)[number]>()

    for (const g of activeGateways) {
      const keyByName = normalizeGatewayKey(g.name)
      const keyByDisplayName = normalizeGatewayKey(g.displayName)
      if (keyByName && !gatewaysByName.has(keyByName)) gatewaysByName.set(keyByName, g)
      if (keyByDisplayName && !gatewaysByDisplayName.has(keyByDisplayName)) gatewaysByDisplayName.set(keyByDisplayName, g)

      const keywords = (g.matchKeywords || "")
        .split(",")
        .map((k) => normalizeGatewayKey(k))
        .filter(Boolean)

      for (const keyword of keywords) {
        if (!gatewaysByKeyword.has(keyword)) gatewaysByKeyword.set(keyword, g)
      }
    }

    const resolvePaymentGateway = (rawMethod: string | null | undefined) => {
      const raw = rawMethod?.trim()
      if (!raw) return null

      const key = normalizeGatewayKey(raw)
      if (!key) return null

      return (
        gatewaysByName.get(key) ||
        gatewaysByDisplayName.get(key) ||
        gatewaysByKeyword.get(key) ||
        Array.from(gatewaysByKeyword.entries()).find(([kw]) => key.includes(kw) || kw.includes(key))?.[1] ||
        activeGateways.find((g) => key.includes(normalizeGatewayKey(g.name)) || key.includes(normalizeGatewayKey(g.displayName))) ||
        null
      )
    }

    const orders = await prisma.order.findMany({
      where: {
        storeId: { in: storeIds },
      },
      select: {
        id: true,
        storeId: true,
        paymentMethod: true,
        paymentGatewayId: true,
        total: true,
        refundAmount: true,
        totalCOGS: true,
        allocatedAdsCost: true,
        transactionFee: true,
      },
    })

    let updated = 0
    let matched = 0

    for (const order of orders) {
      const resolved = resolvePaymentGateway(order.paymentMethod)
      if (!resolved) continue
      matched++

      const newFee = calculateTransactionFee(Number(order.total), {
        id: resolved.id,
        name: resolved.name,
        displayName: resolved.displayName,
        feePercentage: Number(resolved.feePercentage),
        feeFixed: Number(resolved.feeFixed),
        isActive: resolved.isActive,
      })

      const currentFee = Number(order.transactionFee)
      const gatewayChanged = order.paymentGatewayId !== resolved.id
      const feeChanged = Math.abs(currentFee - newFee) > 0.0001

      if (!gatewayChanged && !feeChanged) continue

      const pl = calculateOrderPL({
        id: order.id,
        total: Number(order.total),
        refundAmount: Number(order.refundAmount),
        totalCOGS: Number(order.totalCOGS),
        transactionFee: newFee,
        allocatedAdsCost: Number(order.allocatedAdsCost),
      })

      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentGatewayId: resolved.id,
          transactionFee: newFee,
          grossProfit: pl.grossProfit,
          netProfit: pl.netProfit,
          profitMargin: pl.profitMargin,
        },
      })

      updated++
    }

    return NextResponse.json({
      success: true,
      message: `Applied gateway matching to ${updated}/${orders.length} orders (${matched} matched)`,
      stats: {
        stores: userStores.length,
        totalOrders: orders.length,
        matched,
        updated,
      },
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }

    console.error("Apply gateway to orders error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to apply gateway mapping" },
      { status: 500 }
    )
  }
}
