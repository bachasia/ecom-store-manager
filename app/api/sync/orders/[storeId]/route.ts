import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/options"
import { prisma } from "@/lib/prisma"
import { ShopbaseClient } from "@/lib/integrations/shopbase"
import { WooCommerceClient } from "@/lib/integrations/woocommerce"
import { WcPluginClient, PluginOrder } from "@/lib/integrations/wc-plugin"
import { calculateTransactionFee } from "@/lib/calculations/transaction-fee"

class CancelledError extends Error {
  constructor() { super('Cancelled by user'); this.name = 'CancelledError' }
}

// POST /api/sync/orders/[storeId] - Sync orders from store
export async function POST(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await params
    const { searchParams } = new URL(req.url)

    // Internal cron call — bypass session auth, authenticate bằng x-cron-internal header
    const cronSecret = process.env.CRON_SECRET
    const isCronCall = cronSecret && req.headers.get("x-cron-internal") === cronSecret

    const session = isCronCall ? null : await getServerSession(authOptions)

    if (!isCronCall && !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get store — cron call tìm theo storeId + autoSyncEnabled, user call tìm theo userId
    const store = await prisma.store.findFirst({
      where: isCronCall
        ? { id: storeId, isActive: true, autoSyncEnabled: true }
        : { id: storeId, userId: session!.user!.id }
    }) as any  // cast to any — pluginSecret field exists at runtime

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    // Cleanup stale started logs (crashed/aborted processes)
    const staleCutoff = new Date(Date.now() - 2 * 60 * 1000)
    await prisma.syncLog.updateMany({
      where: {
        storeId: store.id,
        status: 'started',
        completedAt: null,
        startedAt: { lt: staleCutoff },
      },
      data: {
        status: 'cancelled',
        errorMessage: 'Auto-cancelled stale sync log',
        completedAt: new Date(),
      }
    })

    // Acquire per-store sync lock to prevent duplicate runs
    const syncLog = await prisma.$transaction(async (tx) => {
      const runningLogs = await tx.syncLog.count({
        where: {
          storeId: store.id,
          status: 'started',
          completedAt: null,
        }
      })

      if (runningLogs > 0) return null

      const lock = await tx.store.updateMany({
        where: {
          id: store.id,
          OR: [
            { lastSyncStatus: null },
            { lastSyncStatus: { notIn: ['in_progress', 'cancelling'] } },
          ],
        },
        data: {
          lastSyncStatus: 'in_progress',
          lastSyncError: null,
        }
      })

      if (lock.count === 0) return null

      return tx.syncLog.create({
        data: {
          storeId: store.id,
          syncType: 'orders',
          status: 'started',
        }
      })
    })

    if (!syncLog) {
      await prisma.store.update({
        where: { id: store.id },
        data: {
          lastSyncStatus: null,
          lastSyncError: 'Sync lock detected. Please retry.',
        }
      }).catch(() => undefined)

      return NextResponse.json(
        { error: 'Store is already syncing. Please wait for current sync to finish.' },
        { status: 409 }
      )
    }

    let ordersCreated = 0
    let ordersUpdated = 0
    let totalProcessed = 0

    try {

      // ─── Helper: kiểm tra cancel flag từ DB ──────────────────────────────
      const isCancelled = async (): Promise<boolean> => {
        const current = await prisma.store.findUnique({
          where: { id: store.id },
          select: { lastSyncStatus: true }
        })
        return current?.lastSyncStatus === 'cancelling'
      }

      // Use last successful orders sync time (separate from product sync)
      const lastOrderSync = await prisma.syncLog.findFirst({
        where: {
          storeId: store.id,
          syncType: 'orders',
          status: 'success',
          completedAt: { not: null },
        },
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true }
      })

      const existingOrderCount = await prisma.order.count({ where: { storeId: store.id } })
      const forceFull = ["1", "true", "yes"].includes((searchParams.get("full") || "").toLowerCase())
      const lastSyncAt = forceFull || existingOrderCount === 0
        ? null
        : (lastOrderSync?.completedAt ?? null)

      type ProductLookup = {
        id: string
        externalId: string
        sku: string
        baseCost: number
      }

      const formatAddress = (addr?: {
        first_name?: string
        last_name?: string
        address1?: string
        address2?: string
        address_1?: string
        address_2?: string
        city?: string
        province?: string
        state?: string
        zip?: string
        postcode?: string
        country?: string
      } | null): string | null => {
        if (!addr) return null
        const fullName = `${addr.first_name || ""} ${addr.last_name || ""}`.trim()
        const parts = [
          fullName,
          addr.address1 || addr.address_1,
          addr.address2 || addr.address_2,
          addr.city,
          addr.province || addr.state,
          addr.zip || addr.postcode,
          addr.country,
        ].filter(Boolean)

        return parts.length > 0 ? parts.join(", ") : null
      }

      const inferUtmMedium = (source: string | null | undefined): string => {
        const v = (source || "").toLowerCase().trim()
        if (!v) return 'not_set'
        if (v.includes('facebook') || v.includes('instagram') || v.includes('tiktok') || v.includes('youtube') || v.includes('social')) return 'social'
        if (v.includes('google') || v.includes('bing') || v.includes('yahoo') || v.includes('organic') || v.includes('search')) return 'organic'
        if (v.includes('email') || v.includes('klaviyo') || v.includes('mailchimp')) return 'email'
        if (v.includes('referral') || v.includes('affiliate') || v.includes('partner')) return 'referral'
        return 'not_set'
      }

      const parseUtmFromUrl = (urlValue: string | null | undefined): { source: string | null; medium: string | null; campaign: string | null } => {
        if (!urlValue) return { source: null, medium: null, campaign: null }

        const trimmed = urlValue.trim()
        if (!trimmed) return { source: null, medium: null, campaign: null }

        try {
          const normalizedUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://')
            ? trimmed
            : `https://dummy.local${trimmed.startsWith('/') ? '' : '/'}${trimmed}`

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

      const parseShopbaseUtmFromAttributes = (attrs?: Array<{ name?: string; value?: string }> | null) => {
        if (!attrs || attrs.length === 0) return { source: null as string | null, medium: null as string | null, campaign: null as string | null }

        const getAttr = (keys: string[]) => {
          for (const entry of attrs) {
            const k = (entry?.name || '').toLowerCase().trim()
            if (!k) continue
            if (keys.some((key) => k === key || k.includes(key))) {
              const v = (entry?.value || '').trim()
              if (v) return v
            }
          }
          return null
        }

        return {
          source: getAttr(['utm_source', 'source']),
          medium: getAttr(['utm_medium', 'medium']),
          campaign: getAttr(['utm_campaign', 'campaign']),
        }
      }

      const normalizeSku = (value: string | null | undefined): string =>
        (value ?? "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")

      const productRows = await prisma.product.findMany({
        where: { storeId: store.id },
        select: { id: true, externalId: true, sku: true, baseCost: true }
      })

      const activeGateways = await (prisma as any).paymentGateway.findMany({
        where: { isActive: true },
      }) as Array<{
        id: string
        name: string
        displayName: string
        matchKeywords?: string | null
        feePercentage: number
        feeFixed: number
        isActive: boolean
      }>

      const productsByExternalId = new Map<string, ProductLookup>()
      const productsBySkuExact = new Map<string, ProductLookup>()
      const productsBySkuLower = new Map<string, ProductLookup>()
      const productsBySkuNormalized = new Map<string, ProductLookup>()

      for (const row of productRows) {
        const mapped: ProductLookup = {
          id: row.id,
          externalId: row.externalId,
          sku: row.sku,
          baseCost: Number(row.baseCost),
        }

        if (row.externalId && !productsByExternalId.has(row.externalId)) {
          productsByExternalId.set(row.externalId, mapped)
        }

        const exactSku = row.sku?.trim()
        if (exactSku && !productsBySkuExact.has(exactSku)) {
          productsBySkuExact.set(exactSku, mapped)
        }

        const lowerSku = exactSku?.toLowerCase()
        if (lowerSku && !productsBySkuLower.has(lowerSku)) {
          productsBySkuLower.set(lowerSku, mapped)
        }

        const normalizedSku = normalizeSku(exactSku)
        if (normalizedSku && !productsBySkuNormalized.has(normalizedSku)) {
          productsBySkuNormalized.set(normalizedSku, mapped)
        }
      }

      const findProductForItem = (item: { sku?: string | null; variant_id?: string | number | null; variation_id?: string | number | null; product_id?: string | number | null }): ProductLookup | null => {
        const candidateExternalIds = [item.variant_id, item.variation_id, item.product_id]

        for (const candidate of candidateExternalIds) {
          if (candidate === null || candidate === undefined) continue
          const key = String(candidate).trim()
          if (!key) continue

          const matchedByExternal = productsByExternalId.get(key)
          if (matchedByExternal) return matchedByExternal
        }

        const rawSku = item.sku?.trim()
        if (!rawSku) return null

        const exact = productsBySkuExact.get(rawSku)
        if (exact) return exact

        const lower = productsBySkuLower.get(rawSku.toLowerCase())
        if (lower) return lower

        const normalized = productsBySkuNormalized.get(normalizeSku(rawSku))
        if (normalized) return normalized

        return null
      }

      const normalizeGatewayKey = (value: string | null | undefined): string =>
        (value || "").toLowerCase().replace(/[^a-z0-9]/g, "")

      const gatewaysByName = new Map<string, typeof activeGateways[number]>()
      const gatewaysByDisplayName = new Map<string, typeof activeGateways[number]>()
      const gatewaysByKeyword = new Map<string, typeof activeGateways[number]>()

      for (const gateway of activeGateways) {
        const keyByName = normalizeGatewayKey(gateway.name)
        const keyByDisplayName = normalizeGatewayKey(gateway.displayName)
        if (keyByName && !gatewaysByName.has(keyByName)) gatewaysByName.set(keyByName, gateway)
        if (keyByDisplayName && !gatewaysByDisplayName.has(keyByDisplayName)) gatewaysByDisplayName.set(keyByDisplayName, gateway)

        const keywords = (gateway.matchKeywords || "")
          .split(",")
          .map((k: string) => normalizeGatewayKey(k))
          .filter(Boolean)

        for (const keyword of keywords) {
          if (!gatewaysByKeyword.has(keyword)) gatewaysByKeyword.set(keyword, gateway)
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

      if (store.platform === 'shopbase') {
        if (!store.apiSecret) throw new Error('API Password is required for ShopBase')
        const client = new ShopbaseClient(store.apiUrl, store.apiKey, store.apiSecret)
        
        const params: any = {}
        params.orderStatus = 'any'
        params.financialStatus = 'any'
        params.fulfillmentStatus = 'any'
        if (lastSyncAt) {
          params.updatedAtMin = lastSyncAt.toISOString()
        }

        const PAGE_SIZE = 50
        let page = 1

        while (true) {
          if (await isCancelled()) throw new CancelledError()

          const orders = await client.getOrders({ ...params, page, limit: PAGE_SIZE })
          if (!orders.length) break

          console.info(`[sync:orders][shopbase] page=${page} orders=${orders.length} total_processed=${totalProcessed}`)

          for (const order of orders) {
            if (await isCancelled()) throw new CancelledError()

            // Dùng thẳng list response — ShopBase (Shopify-based) đã trả về đủ
            // gateway, source_name, landing_site, referring_site, note_attributes trong list endpoint.
            // Bỏ getOrder per-order để tránh N+1 requests (tiết kiệm ~80% thời gian sync).
            const sourceOrder = order

            const existingOrder = await prisma.order.findUnique({
              where: {
                storeId_externalId: {
                  storeId: store.id,
                  externalId: sourceOrder.id.toString(),
                }
              }
            })

            // Calculate totals
            const shippingTotal = (sourceOrder.shipping_lines || []).reduce(
              (sum, line) => sum + parseFloat(line.price || '0'), 
              0
            )

            const refundTotal = 0 // Shopbase doesn't provide refund info in basic order object

            // Get payment gateway for transaction fee calculation
            const rawPaymentMethod = [
              sourceOrder.gateway,
              Array.isArray(sourceOrder.payment_gateway_names) ? sourceOrder.payment_gateway_names.join(', ') : null,
              sourceOrder.source_name,
            ].find((v) => typeof v === 'string' && v.trim().length > 0) as string | undefined

            const paymentGateway = resolvePaymentGateway(rawPaymentMethod)

            // Calculate transaction fee
            const transactionFee = calculateTransactionFee(
              parseFloat(sourceOrder.total_price),
              paymentGateway ? {
                id: paymentGateway.id,
                name: paymentGateway.name,
                displayName: paymentGateway.displayName,
                feePercentage: Number(paymentGateway.feePercentage),
                feeFixed: Number(paymentGateway.feeFixed),
                isActive: paymentGateway.isActive,
              } : null
            )

            // Calculate total COGS from order items
            let totalCOGS = 0
            for (const item of sourceOrder.line_items) {
              const product = findProductForItem(item as { sku?: string | null; variant_id?: string | number | null; variation_id?: string | number | null; product_id?: string | number | null })
              totalCOGS += Number(product?.baseCost || 0) * item.quantity
            }

            const utmParsed = parseUtmFromUrl(sourceOrder.landing_site_ref || sourceOrder.landing_site || sourceOrder.referring_site)
            const utmFromAttrs = parseShopbaseUtmFromAttributes(sourceOrder.note_attributes)
            const utmSource = utmParsed.source || utmFromAttrs.source || sourceOrder.source_name || null
            const utmMedium = utmParsed.medium || utmFromAttrs.medium || inferUtmMedium(utmSource)
            const utmCampaign = utmParsed.campaign || utmFromAttrs.campaign || null

            const orderData = {
              orderNumber: String(sourceOrder.order_number),
              orderDate: new Date(sourceOrder.created_at),
              status: sourceOrder.financial_status || 'pending',
              customerEmail: sourceOrder.customer?.email || null,
              customerName: sourceOrder.customer 
                ? `${sourceOrder.customer.first_name} ${sourceOrder.customer.last_name}`.trim()
                : null,
              customerCountry: sourceOrder.shipping_address?.country || sourceOrder.billing_address?.country || sourceOrder.customer?.default_address?.country || null,
              billingAddress: formatAddress(sourceOrder.billing_address),
              shippingAddress: formatAddress(sourceOrder.shipping_address),
              subtotal: parseFloat(sourceOrder.subtotal_price),
              discount: parseFloat(sourceOrder.total_discounts),
              shipping: shippingTotal,
              tax: parseFloat(sourceOrder.total_tax),
              total: parseFloat(sourceOrder.total_price),
              refundAmount: refundTotal,
              paymentMethod: rawPaymentMethod || null,
              paymentGatewayId: paymentGateway?.id || null,
              transactionFee: transactionFee,
              totalCOGS: totalCOGS,
              utmSource,
              utmMedium,
              utmCampaign,
            }

            if (existingOrder) {
              await prisma.order.update({
                where: { id: existingOrder.id },
                data: orderData,
              })
              ordersUpdated++
            } else {
              const newOrder = await prisma.order.create({
                data: {
                  storeId: store.id,
                  externalId: sourceOrder.id.toString(),
                  ...orderData,
                }
              })

              // Create order items
              for (const item of sourceOrder.line_items) {
                const product = findProductForItem(item as { sku?: string | null; variant_id?: string | number | null; variation_id?: string | number | null; product_id?: string | number | null })

                await prisma.orderItem.create({
                  data: {
                    orderId: newOrder.id,
                    productId: product?.id || null,
                    sku: item.sku || `item-${item.id}`,
                    productName: item.name,
                    quantity: item.quantity,
                    price: parseFloat(item.price),
                    total: parseFloat(item.price) * item.quantity,
                    unitCost: Number(product?.baseCost || 0),
                    totalCost: Number(product?.baseCost || 0) * item.quantity,
                  }
                })
              }

              ordersCreated++
            }

            totalProcessed++
          }

          if (orders.length < PAGE_SIZE) break
          page++
        }

      } else if (store.platform === 'woocommerce') {

        // ── Shared helper: upsert 1 order (plugin format hoặc WC REST format) ──
        const upsertOrder = async (orderInput: {
          id: number | string
          number: string | number
          status: string
          date_created: string | null
          total: string | number
          subtotal: string | number
          discount_total: string | number
          shipping_total: string | number
          total_tax: string | number
          refund_total?: number
          refunds?: Array<{ total: string }>
          payment_method?: string | null
          payment_method_title?: string | null
          billing: { email?: string; first_name?: string; last_name?: string; country?: string; address_1?: string; address_2?: string; city?: string; state?: string; postcode?: string }
          shipping?: { country?: string; first_name?: string; last_name?: string; address_1?: string; address_2?: string; city?: string; state?: string; postcode?: string }
          line_items: Array<{ id: number; sku?: string | null; product_id?: number | null; variation_id?: number | null; name: string; quantity: number; price: number; total: number | string }>
          meta_data?: Array<{ key: string; value: any }>
        }) => {
          const externalId = String(orderInput.id)

          const refundTotal = orderInput.refund_total
            ?? (orderInput.refunds?.reduce((s, r) => s + Math.abs(parseFloat(r.total)), 0) ?? 0)

          let totalCOGS = 0
          for (const item of orderInput.line_items) {
            const product = findProductForItem({ sku: item.sku, variation_id: item.variation_id, product_id: item.product_id })
            totalCOGS += Number(product?.baseCost || 0) * item.quantity
          }

          const metaList = orderInput.meta_data || []
          const getMeta = (keys: string[]) => {
            const normalizedKeys = keys.map(k => k.toLowerCase())

            // 1) exact match first
            for (const key of normalizedKeys) {
              const m = metaList.find(d => (d.key || '').toLowerCase() === key)
              if (m?.value != null && String(m.value).trim()) return String(m.value)
            }

            // 2) contains match fallback for compatibility
            for (const key of normalizedKeys) {
              const m = metaList.find(d => (d.key || '').toLowerCase().includes(key))
              if (m?.value != null && String(m.value).trim()) return String(m.value)
            }

            return null
          }

          const parseUtmFromUrl = (urlValue: string | null | undefined): { source: string | null; medium: string | null; campaign: string | null } => {
            if (!urlValue) return { source: null, medium: null, campaign: null }

            const trimmed = urlValue.trim()
            if (!trimmed) return { source: null, medium: null, campaign: null }

            try {
              const normalizedUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://')
                ? trimmed
                : `https://dummy.local${trimmed.startsWith('/') ? '' : '/'}${trimmed}`

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

          const rawPaymentMethod = orderInput.payment_method_title || orderInput.payment_method || getMeta(['_payment_method_title', '_payment_method'])
          const paymentGateway = resolvePaymentGateway(rawPaymentMethod)
          const transactionFee = calculateTransactionFee(
            parseFloat(String(orderInput.total)),
            paymentGateway ? { id: paymentGateway.id, name: paymentGateway.name, displayName: paymentGateway.displayName, feePercentage: Number(paymentGateway.feePercentage), feeFixed: Number(paymentGateway.feeFixed), isActive: paymentGateway.isActive } : null
          )

          const attributionSource = getMeta([
            'utm_source',
            '_utm_source',
            '_wc_order_attribution_utm_source',
            '_wc_order_attribution_source_type',
            'source',
            '_source',
          ])
          const attributionMedium = getMeta([
            'utm_medium',
            '_utm_medium',
            '_wc_order_attribution_utm_medium',
            'medium',
            '_medium',
          ])
          const attributionCampaign = getMeta([
            'utm_campaign',
            '_utm_campaign',
            '_wc_order_attribution_utm_campaign',
            'campaign',
            '_campaign',
          ])

          const landingOrReferrer =
            getMeta(['landing_site_ref', '_landing_site_ref']) ||
            getMeta(['landing_site', '_landing_site']) ||
            getMeta(['referring_site', '_referring_site']) ||
            getMeta(['_wc_order_attribution_session_entry']) ||
            getMeta(['_wc_order_attribution_referrer'])

          const utmFromUrl = parseUtmFromUrl(landingOrReferrer)
          const utmSource = attributionSource || utmFromUrl.source
          const utmMediumRaw = attributionMedium || utmFromUrl.medium
          const utmCampaign = attributionCampaign || utmFromUrl.campaign
          const utmMedium = utmMediumRaw || inferUtmMedium(utmSource)

          const orderData = {
            orderNumber: String(orderInput.number),
            orderDate: new Date(orderInput.date_created || Date.now()),
            status: orderInput.status,
            customerEmail: orderInput.billing?.email || null,
            customerName: `${orderInput.billing?.first_name || ''} ${orderInput.billing?.last_name || ''}`.trim() || null,
            customerCountry: orderInput.shipping?.country || orderInput.billing?.country || null,
            billingAddress: formatAddress(orderInput.billing),
            shippingAddress: formatAddress(orderInput.shipping),
            subtotal: parseFloat(String(orderInput.subtotal)) || 0,
            discount: parseFloat(String(orderInput.discount_total)) || 0,
            shipping: parseFloat(String(orderInput.shipping_total)) || 0,
            tax: parseFloat(String(orderInput.total_tax)) || 0,
            total: parseFloat(String(orderInput.total)) || 0,
            refundAmount: refundTotal,
            paymentMethod: rawPaymentMethod || null,
            paymentGatewayId: paymentGateway?.id || null,
            transactionFee,
            totalCOGS,
            utmSource,
            utmMedium,
            utmCampaign,
          }

          const existingOrder = await prisma.order.findUnique({
            where: { storeId_externalId: { storeId: store.id, externalId } }
          })

          if (existingOrder) {
            await prisma.order.update({ where: { id: existingOrder.id }, data: orderData })
            ordersUpdated++
          } else {
            const newOrder = await prisma.order.create({ data: { storeId: store.id, externalId, ...orderData } })
            for (const item of orderInput.line_items) {
              const product = findProductForItem({ sku: item.sku, variation_id: item.variation_id, product_id: item.product_id })
              await prisma.orderItem.create({
                data: {
                  orderId: newOrder.id,
                  productId: product?.id || null,
                  sku: item.sku || `item-${item.id}`,
                  productName: item.name,
                  quantity: item.quantity,
                  price: item.price,
                  total: parseFloat(String(item.total)),
                  unitCost: Number(product?.baseCost || 0),
                  totalCost: Number(product?.baseCost || 0) * item.quantity,
                }
              })
            }
            ordersCreated++
          }
          totalProcessed++
        }

        if (store.pluginSecret) {
          // ── Plugin fast path ─────────────────────────────────────────────────
          console.info('[sync:orders] Using PNL Sync Plugin — fast path')
          const pluginClient = new WcPluginClient(store.apiUrl, store.pluginSecret)

          await pluginClient.streamOrders({
            modifiedAfter: lastSyncAt?.toISOString(),
            perPage: 100,  // 100 orders/page — consistent với products sync
            onPage: async (orders, pageInfo) => {
              console.info(`[sync:orders][plugin] page=${pageInfo.page}/${pageInfo.totalPages} orders=${orders.length}`)
              for (const order of orders) {
                if (await isCancelled()) throw new CancelledError()
                await upsertOrder(order as any)
              }
            },
            onProgress: (fetched, total) => {
              console.info(`[sync:orders][plugin] fetched=${fetched}/${total}`)
            },
          })

        } else {
          // ── WooCommerce REST API fallback ────────────────────────────────────
          if (!store.apiSecret) throw new Error("API Secret is required for WooCommerce")
          console.info('[sync:orders] Using WooCommerce REST API (install PNL Plugin for faster sync)')

          const client = new WooCommerceClient(store.apiUrl, store.apiKey, store.apiSecret)
          const params: any = {}
          if (lastSyncAt) params.modifiedAfter = lastSyncAt.toISOString()

          await client.streamAllOrders({
            ...params,
            onPage: async (orders, { page, fetched }) => {
              console.info(`[sync:orders][wc-rest] page=${page} orders=${orders.length} total_processed=${totalProcessed}`)
              for (const order of orders) {
                if (await isCancelled()) throw new CancelledError()
                await upsertOrder({
                  ...order,
                  billing: { ...order.billing },
                  shipping: order.shipping ? { ...order.shipping } : undefined,
                  line_items: order.line_items.map(item => ({
                    id: item.id,
                    sku: item.sku,
                    product_id: null,
                    variation_id: null,
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                    total: item.total,
                  })),
                } as any)
              }
            },
            onProgress: (fetched) => {
              console.info(`[sync:orders][wc-rest] fetched=${fetched}`)
            },
          })
        }

      } else {
        throw new Error("Platform not supported")
      }

      // Update sync log
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'success',
          recordsProcessed: totalProcessed,
          recordsCreated: ordersCreated,
          recordsUpdated: ordersUpdated,
          completedAt: new Date(),
        }
      })

      // Update store
      await prisma.store.update({
        where: { id: store.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: 'success',
          lastSyncError: null,
          lastOrderAutoSyncAt: new Date(),
        }
      })

      return NextResponse.json({
        success: true,
        message: `Synced ${totalProcessed} orders (${ordersCreated} new, ${ordersUpdated} updated) [${lastSyncAt ? 'incremental' : 'full'}]`,
        stats: {
          processed: totalProcessed,
          created: ordersCreated,
          updated: ordersUpdated,
          mode: lastSyncAt ? 'incremental' : 'full',
        }
      })

    } catch (error: any) {
      if (error instanceof CancelledError) {
        await prisma.syncLog.update({
          where: { id: syncLog.id },
          data: {
            status: 'cancelled',
            errorMessage: 'Cancelled by user',
            completedAt: new Date(),
            recordsProcessed: totalProcessed,
            recordsCreated: ordersCreated,
            recordsUpdated: ordersUpdated,
          }
        })
        await prisma.store.update({
          where: { id: store.id },
          data: { lastSyncStatus: 'cancelled', lastSyncError: 'Cancelled by user' }
        })
        return NextResponse.json({ success: false, cancelled: true, message: `Sync đã bị dừng (đã xử lý ${totalProcessed} đơn hàng)` })
      }

      console.error("Order sync error:", error)
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: { status: 'error', errorMessage: error.message, completedAt: new Date() }
      })
      await prisma.store.update({
        where: { id: store.id },
        data: { lastSyncStatus: 'error', lastSyncError: error.message }
      })
      throw error
    }

  } catch (error: any) {
    console.error("Sync orders error:", error)
    return NextResponse.json(
      { error: error.message || "An error occurred while syncing orders" },
      { status: 500 }
    )
  }
}
