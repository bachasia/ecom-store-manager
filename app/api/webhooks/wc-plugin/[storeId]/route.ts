import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"
import { PluginProduct, PluginOrder } from "@/lib/integrations/wc-plugin"
import { calculateTransactionFee } from "@/lib/calculations/transaction-fee"

/**
 * POST /api/webhooks/wc-plugin/[storeId]
 *
 * Receives real-time push events from the PNL Sync WordPress plugin.
 * Header: X-PNL-Secret — must match store.pluginSecret
 * Header: X-PNL-Event  — 'product.updated' | 'product.deleted' | 'order.updated'
 *
 * Body:
 *   product.updated: { product: PluginProduct }
 *   product.deleted: { product_id: number }
 *   order.updated:   { order: PluginOrder }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await params

    // ── 1. Fetch store (no user auth needed — uses shared secret) ─────────────
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        platform: true,
        apiUrl: true,
        pluginSecret: true,
        currency: true,
        timezone: true,
      }
    })

    if (!store || !store.pluginSecret) {
      return NextResponse.json({ error: 'Store not found or plugin not configured' }, { status: 404 })
    }

    // ── 2. Verify secret ────────────────────────────────────────────────────────
    const providedSecret = req.headers.get('X-PNL-Secret') || req.headers.get('x-pnl-secret')
    const storedSecret   = decrypt(store.pluginSecret)

    // Constant-time compare
    if (!providedSecret || !timingSafeEqual(storedSecret, providedSecret)) {
      console.warn(`[webhook] Unauthorized attempt for store ${storeId}`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const event = req.headers.get('X-PNL-Event') || req.headers.get('x-pnl-event') || ''
    const body  = await req.json()

    // ── 3. Handle events ────────────────────────────────────────────────────────
    if (event === 'product.updated' && body.product) {
      const result = await handleProductUpsert(store.id, body.product as PluginProduct)
      return NextResponse.json({ ok: true, ...result })
    }

    if (event === 'product.deleted' && body.product_id) {
      await prisma.product.updateMany({
        where: {
          storeId:    store.id,
          externalId: String(body.product_id),
        },
        data: { isActive: false }
      })
      return NextResponse.json({ ok: true, action: 'deactivated', product_id: body.product_id })
    }

    if (event === 'order.updated' && body.order) {
      const result = await handleOrderUpsert(store.id, body.order as PluginOrder)
      return NextResponse.json({ ok: true, ...result })
    }

    // Unknown event — accept and ignore (forward compatibility)
    return NextResponse.json({ ok: true, ignored: true, event })

  } catch (error: any) {
    console.error('[webhook] wc-plugin error:', error)
    // Return 200 to prevent WordPress from retrying repeatedly
    return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Constant-time string comparison to prevent timing attacks */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still run comparison to avoid early exit timing leak
    let diff = 0
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
    }
    return false
  }
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/** Upsert a single product (with inline variations) into DB */
async function handleProductUpsert(
  storeId: string,
  product: PluginProduct
): Promise<{ action: string; count: number }> {
  let count = 0

  const upsertVariant = async (opts: {
    externalId: string
    parentExternalId: string | null
    sku: string
    name: string
    variantName: string | null
    price: number
    imageUrl: string | null
    hasSkuWarning: boolean
  }) => {
    const existing = await prisma.product.findUnique({
      where: { storeId_externalId_sku: { storeId, externalId: opts.externalId, sku: opts.sku } }
    })

    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          name:             opts.name,
          variantName:      opts.variantName,
          parentExternalId: opts.parentExternalId,
          price:            opts.price,
          imageUrl:         opts.imageUrl,
          isActive:         true,
          hasSkuWarning:    opts.hasSkuWarning,
        }
      })
    } else {
      await prisma.product.create({
        data: {
          storeId,
          externalId:       opts.externalId,
          parentExternalId: opts.parentExternalId,
          sku:              opts.sku,
          name:             opts.name,
          variantName:      opts.variantName,
          price:            opts.price,
          imageUrl:         opts.imageUrl,
          isActive:         true,
          hasSkuWarning:    opts.hasSkuWarning,
        }
      })
    }
    count++
  }

  if (product.type === 'simple') {
    const hasOriginalSku = !!product.sku?.trim()
    await upsertVariant({
      externalId:       product.id.toString(),
      parentExternalId: null,
      sku:              hasOriginalSku ? product.sku.trim() : `wc-${product.id}`,
      name:             product.name,
      variantName:      null,
      price:            parseFloat(product.price) || 0,
      imageUrl:         product.image_url,
      hasSkuWarning:    !hasOriginalSku,
    })
  } else if (product.type === 'variable') {
    for (const variation of product.variations) {
      const hasOriginalSku = !!variation.sku?.trim()
      const variantName = variation.attributes.length > 0
        ? variation.attributes.map(a => a.option).join(' / ')
        : null

      await upsertVariant({
        externalId:       variation.id.toString(),
        parentExternalId: product.id.toString(),
        sku:              hasOriginalSku ? variation.sku.trim() : `wc-var-${variation.id}`,
        name:             product.name,
        variantName,
        price:            parseFloat(variation.price) || 0,
        imageUrl:         variation.image_url ?? product.image_url,
        hasSkuWarning:    !hasOriginalSku,
      })
    }
  }

  return { action: 'upserted', count }
}

/** Upsert a single order into DB */
async function handleOrderUpsert(
  storeId: string,
  order: PluginOrder
): Promise<{ action: 'created' | 'updated' }> {
  // Load products for COGS calculation
  const productRows = await prisma.product.findMany({
    where: { storeId },
    select: { id: true, externalId: true, sku: true, baseCost: true }
  })

  const byExternalId = new Map(productRows.map(p => [p.externalId, p]))
  const bySku        = new Map(productRows.map(p => [p.sku?.trim().toLowerCase(), p]))

  const findProduct = (item: { sku?: string; variation_id?: number | null; product_id?: number }) => {
    if (item.variation_id) {
      const p = byExternalId.get(String(item.variation_id))
      if (p) return p
    }
    if (item.product_id) {
      const p = byExternalId.get(String(item.product_id))
      if (p) return p
    }
    if (item.sku) {
      return bySku.get(item.sku.trim().toLowerCase()) || null
    }
    return null
  }

  // Load payment gateways
  const gateways = await (prisma as any).paymentGateway.findMany({ where: { isActive: true } }) as Array<{
    id: string; name: string; displayName: string; matchKeywords?: string | null
    feePercentage: number; feeFixed: number; isActive: boolean
  }>

  const normalizeKey = (v: string) => (v || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const resolveGateway = (raw?: string | null) => {
    if (!raw) return null
    const key = normalizeKey(raw)
    return gateways.find(g =>
      normalizeKey(g.name) === key ||
      normalizeKey(g.displayName) === key ||
      (g.matchKeywords || '').split(',').some((k: string) => normalizeKey(k) === key)
    ) || null
  }

  // Calculate totals
  let totalCOGS = 0
  for (const item of order.line_items) {
    const p = findProduct(item)
    totalCOGS += Number(p?.baseCost || 0) * item.quantity
  }

  const getMeta = (keys: string[]) => {
    for (const key of keys) {
      const m = order.meta_data?.find(d => d.key.toLowerCase() === key.toLowerCase())
      if (m?.value) return m.value
    }
    return null
  }

  const rawPaymentMethod = order.payment_method_title || order.payment_method
  const gateway          = resolveGateway(rawPaymentMethod)
  const transactionFee   = calculateTransactionFee(
    parseFloat(order.total),
    gateway ? { id: gateway.id, name: gateway.name, displayName: gateway.displayName,
      feePercentage: Number(gateway.feePercentage), feeFixed: Number(gateway.feeFixed),
      isActive: gateway.isActive } : null
  )

  const utmSource   = getMeta(['utm_source', '_utm_source'])
  const utmMedium   = getMeta(['utm_medium', '_utm_medium'])
  const utmCampaign = getMeta(['utm_campaign', '_utm_campaign'])

  const orderData = {
    orderNumber:      String(order.number),
    orderDate:        new Date(order.date_created || Date.now()),
    status:           order.status,
    customerEmail:    order.billing?.email || null,
    customerName:     `${order.billing?.first_name || ''} ${order.billing?.last_name || ''}`.trim() || null,
    customerCountry:  order.shipping?.country || order.billing?.country || null,
    billingAddress:   formatAddress(order.billing),
    shippingAddress:  formatAddress(order.shipping),
    subtotal:         parseFloat(order.subtotal) || 0,
    discount:         parseFloat(order.discount_total) || 0,
    shipping:         parseFloat(order.shipping_total) || 0,
    tax:              parseFloat(order.total_tax) || 0,
    total:            parseFloat(order.total) || 0,
    refundAmount:     order.refund_total || 0,
    paymentMethod:    rawPaymentMethod || null,
    paymentGatewayId: gateway?.id || null,
    transactionFee,
    totalCOGS,
    utmSource,
    utmMedium,
    utmCampaign,
  }

  const existing = await prisma.order.findUnique({
    where: { storeId_externalId: { storeId, externalId: String(order.id) } }
  })

  if (existing) {
    await prisma.order.update({ where: { id: existing.id }, data: orderData })
    return { action: 'updated' }
  }

  const newOrder = await prisma.order.create({
    data: { storeId, externalId: String(order.id), ...orderData }
  })

  // Create order items
  for (const item of order.line_items) {
    const p = findProduct(item)
    await prisma.orderItem.create({
      data: {
        orderId:     newOrder.id,
        productId:   p?.id || null,
        sku:         item.sku || `item-${item.id}`,
        productName: item.name,
        quantity:    item.quantity,
        price:       item.price,
        total:       item.total,
        unitCost:    Number(p?.baseCost || 0),
        totalCost:   Number(p?.baseCost || 0) * item.quantity,
      }
    })
  }

  return { action: 'created' }
}

function formatAddress(addr?: {
  first_name?: string; last_name?: string
  address_1?: string; address_2?: string
  city?: string; state?: string; postcode?: string; country?: string
} | null): string | null {
  if (!addr) return null
  const parts = [
    `${addr.first_name || ''} ${addr.last_name || ''}`.trim(),
    addr.address_1, addr.address_2,
    addr.city, addr.state, addr.postcode, addr.country,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}
