import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { ShopbaseClient } from "@/lib/integrations/shopbase"
import { WooCommerceClient } from "@/lib/integrations/woocommerce"
import { WcPluginClient } from "@/lib/integrations/wc-plugin"

// POST /api/stores/[id]/test - Test store connection
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const debugUtm = ["1", "true", "yes"].includes((searchParams.get("debugUtm") || "").toLowerCase())
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get store with encrypted credentials (pluginSecret included for plugin test)
    const store = await prisma.store.findFirst({
      where: { id: id, userId: session.user.id }
    }) as any

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    let result: { success: boolean; message: string }

    if (store.platform === 'shopbase') {
      if (!store.apiSecret) {
        return NextResponse.json(
          { error: "API Password is required for ShopBase" },
          { status: 400 }
        )
      }
      const client = new ShopbaseClient(store.apiUrl, store.apiKey, store.apiSecret)
      result = await client.testConnection()

      if (debugUtm && result.success) {
        const parseUtmFromUrl = (urlValue: string | null | undefined) => {
          if (!urlValue) return { source: null as string | null, medium: null as string | null, campaign: null as string | null }
          try {
            const normalizedUrl = urlValue.startsWith('http://') || urlValue.startsWith('https://')
              ? urlValue
              : `https://dummy.local${urlValue.startsWith('/') ? '' : '/'}${urlValue}`
            const parsed = new URL(normalizedUrl)
            return {
              source: parsed.searchParams.get('utm_source'),
              medium: parsed.searchParams.get('utm_medium'),
              campaign: parsed.searchParams.get('utm_campaign'),
            }
          } catch {
            return { source: null, medium: null, campaign: null }
          }
        }

        const getAttr = (attrs: Array<{ name?: string; value?: string }> | undefined, keys: string[]) => {
          if (!attrs?.length) return null
          for (const a of attrs) {
            const k = (a.name || '').toLowerCase()
            if (keys.some((key) => k === key || k.includes(key))) {
              const v = (a.value || '').trim()
              if (v) return v
            }
          }
          return null
        }

        const listOrders = await client.getOrders({
          limit: 5,
          page: 1,
          orderStatus: 'any',
          financialStatus: 'any',
          fulfillmentStatus: 'any',
        })

        const samples = await Promise.all(
          listOrders.map(async (o) => {
            const detail = await client.getOrder(o.id).catch(() => null)
            const source = detail || o
            const parsed = parseUtmFromUrl(source.landing_site_ref || source.landing_site || source.referring_site)
            const attrSource = getAttr(source.note_attributes, ['utm_source', 'source'])
            const attrMedium = getAttr(source.note_attributes, ['utm_medium', 'medium'])
            const attrCampaign = getAttr(source.note_attributes, ['utm_campaign', 'campaign'])

            return {
              orderId: source.id,
              orderNumber: source.order_number,
              payment: {
                gateway: source.gateway || null,
                paymentGatewayNames: source.payment_gateway_names || [],
                sourceName: source.source_name || null,
              },
              rawAttribution: {
                landingSiteRef: source.landing_site_ref || null,
                landingSite: source.landing_site || null,
                referringSite: source.referring_site || null,
                noteAttributes: source.note_attributes || [],
              },
              extracted: {
                utmSource: parsed.source || attrSource || source.source_name || null,
                utmMedium: parsed.medium || attrMedium || null,
                utmCampaign: parsed.campaign || attrCampaign || null,
              }
            }
          })
        )

        return NextResponse.json({
          success: true,
          message: result.message,
          debugUtm: {
            sampleCount: samples.length,
            samples,
          }
        })
      }
    } else if (store.platform === 'woocommerce') {
      const { searchParams: sp } = new URL(req.url)
      const testPlugin = ["1", "true", "yes"].includes((sp.get("plugin") || "").toLowerCase())

      if (testPlugin) {
        // Test PNL Sync Plugin connection
        if (!store.pluginSecret) {
          return NextResponse.json(
            { success: false, message: "Plugin secret not configured for this store" },
            { status: 400 }
          )
        }
        const pluginClient = new WcPluginClient(store.apiUrl, store.pluginSecret)
        result = await pluginClient.testConnection()
      } else {
        // Test standard WooCommerce REST API
        if (!store.apiSecret) {
          return NextResponse.json(
            { error: "API Secret is required for WooCommerce" },
            { status: 400 }
          )
        }
        const client = new WooCommerceClient(store.apiUrl, store.apiKey, store.apiSecret)
        result = await client.testConnection()
      }
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
