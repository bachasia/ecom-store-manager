import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { getStoreIdsWithPermission, isSuperAdmin } from "@/lib/permissions"

const DEFAULT_GATEWAYS = [
  { name: "stripe", displayName: "Stripe", feePercentage: 2.9, feeFixed: 0.3, isActive: true },
  { name: "paypal", displayName: "PayPal", feePercentage: 2.99, feeFixed: 0.49, isActive: true },
  { name: "square", displayName: "Square", feePercentage: 2.6, feeFixed: 0.1, isActive: true },
  { name: "authorize_net", displayName: "Authorize.Net", feePercentage: 2.9, feeFixed: 0.3, isActive: true },
  { name: "braintree", displayName: "Braintree", feePercentage: 2.9, feeFixed: 0.3, isActive: true },
  { name: "shopify_payments", displayName: "Shopify Payments", feePercentage: 2.9, feeFixed: 0.3, isActive: true },
]

// POST /api/settings/gateways/initialize - Initialize default payment gateways
export async function POST() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const canManage = (await isSuperAdmin(session.user.id)) ||
      (await getStoreIdsWithPermission(session.user.id, 'manage_settings')).length > 0
    if (!canManage) {
      return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 })
    }

    await prisma.$transaction(
      DEFAULT_GATEWAYS.map((gateway) =>
        prisma.paymentGateway.upsert({
          where: { name: gateway.name },
          update: {
            displayName: gateway.displayName,
            feePercentage: gateway.feePercentage,
            feeFixed: gateway.feeFixed,
            isActive: gateway.isActive,
          },
          create: gateway,
        })
      )
    )

    const gateways = await prisma.paymentGateway.findMany({
      orderBy: { name: "asc" },
    })

    return NextResponse.json({
      success: true,
      message: "Default payment gateways initialized",
      count: gateways.length,
      gateways,
    })
  } catch (error) {
    console.error("Initialize gateways error:", error)
    return NextResponse.json(
      { error: "An error occurred while initializing payment gateways" },
      { status: 500 }
    )
  }
}
