import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { ShopbaseClient } from "@/lib/integrations/shopbase"
import { WooCommerceClient } from "@/lib/integrations/woocommerce"

// POST /api/stores/[id]/test - Test store connection
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

    // Get store with encrypted credentials
    const store = await prisma.store.findFirst({
      where: {
        id: id,
        userId: session.user.id
      }
    })

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    let result: { success: boolean; message: string }

    if (store.platform === 'shopbase') {
      const client = new ShopbaseClient(store.apiUrl, store.apiKey)
      result = await client.testConnection()
    } else if (store.platform === 'woocommerce') {
      if (!store.apiSecret) {
        return NextResponse.json(
          { error: "API Secret is required for WooCommerce" },
          { status: 400 }
        )
      }
      const client = new WooCommerceClient(store.apiUrl, store.apiKey, store.apiSecret)
      result = await client.testConnection()
    } else {
      return NextResponse.json(
        { error: "Platform not supported" },
        { status: 400 }
      )
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Test connection error:", error)
    return NextResponse.json(
      { 
        success: false,
        message: error.message || "An error occurred while testing connection" 
      },
      { status: 500 }
    )
  }
}
