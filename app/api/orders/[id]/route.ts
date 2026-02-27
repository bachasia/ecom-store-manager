import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"

// GET /api/orders/[id] - Get order detail with P&L breakdown
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const order = await prisma.order.findFirst({
      where: {
        id: id,
        store: {
          userId: session.user.id
        }
      },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            currency: true,
          }
        },
        paymentGateway: {
          select: {
            id: true,
            name: true,
            displayName: true,
            feePercentage: true,
            feeFixed: true,
          }
        },
        orderItems: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                baseCost: true,
              }
            }
          }
        }
      }
    })

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // Calculate P&L breakdown
    const revenue = Number(order.total) - Number(order.refundAmount)
    const cogs = Number(order.totalCOGS)
    const grossProfit = revenue - cogs
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
    const transactionFee = Number(order.transactionFee)
    const adsCost = Number(order.allocatedAdsCost)
    const netProfit = grossProfit - transactionFee - adsCost
    const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0

    const plBreakdown = {
      revenue: Math.round(revenue * 100) / 100,
      cogs: Math.round(cogs * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossMargin: Math.round(grossMargin * 100) / 100,
      transactionFee: Math.round(transactionFee * 100) / 100,
      adsCost: Math.round(adsCost * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
    }

    return NextResponse.json({
      order,
      plBreakdown
    })

  } catch (error: any) {
    console.error("Get order error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to get order" },
      { status: 500 }
    )
  }
}
