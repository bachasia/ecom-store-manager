import axios, { AxiosInstance } from 'axios'
import { decrypt } from '@/lib/encryption'

// ─── Types matching the PHP plugin response format ────────────────────────────

export interface PluginProduct {
  id: number
  name: string
  type: string         // 'simple' | 'variable' | 'grouped' | 'external'
  sku: string
  price: string
  image_url: string | null
  modified: string | null
  variations: PluginVariation[]
}

export interface PluginVariation {
  id: number
  sku: string
  price: string
  attributes: Array<{ name: string; option: string }>
  image_url: string | null
}

export interface PluginOrder {
  id: number
  number: string
  status: string
  date_created: string | null
  date_modified: string | null
  total: string
  subtotal: string
  discount_total: string
  shipping_total: string
  total_tax: string
  refund_total: number
  payment_method: string
  payment_method_title: string
  customer_id: number
  billing: {
    first_name: string
    last_name: string
    email: string
    address_1?: string
    address_2?: string
    city?: string
    state?: string
    postcode?: string
    country: string
  }
  shipping: {
    first_name?: string
    last_name?: string
    address_1?: string
    address_2?: string
    city?: string
    state?: string
    postcode?: string
    country?: string
  }
  line_items: Array<{
    id: number
    product_id: number
    variation_id: number | null
    name: string
    sku: string
    quantity: number
    price: number
    total: number
  }>
  meta_data: Array<{ key: string; value: string }>
}

interface PluginProductPage {
  products: PluginProduct[]
  total: number
  page: number
  per_page: number
  total_pages: number
  has_more: boolean
}

interface PluginOrderPage {
  orders: PluginOrder[]
  total: number
  page: number
  per_page: number
  total_pages: number
  has_more: boolean
}

export interface PluginStatus {
  status: string
  plugin_version: string
  wc_version: string | null
  product_count: number
  order_count: number
  site_url: string
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class WcPluginClient {
  private client: AxiosInstance
  private baseUrl: string
  private secret: string

  constructor(storeUrl: string, encryptedSecret: string) {
    this.baseUrl = `${storeUrl.replace(/\/$/, '')}/wp-json/pnl-sync/v1`
    this.secret = decrypt(encryptedSecret)

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 180000,  // 3 minutes — WooCommerce với 20k+ products cần thời gian query DB
      headers: {
        'X-PNL-Secret': this.secret,
        'Content-Type': 'application/json',
      },
    })
  }

  // ─── Connection test ────────────────────────────────────────────────────────

  async testConnection(): Promise<{ success: boolean; message: string; status?: PluginStatus }> {
    try {
      const res = await this.client.get<PluginStatus>('/status', { timeout: 10000 })
      return {
        success: true,
        message: `PNL Plugin v${res.data.plugin_version} connected — ${res.data.product_count} products, ${res.data.order_count} orders`,
        status: res.data,
      }
    } catch (error: any) {
      const status = error?.response?.status
      let message = error?.response?.data?.message || error.message || 'Cannot connect to plugin'
      if (status === 401) message = 'Invalid secret token — check plugin settings'
      if (status === 503) message = 'Plugin secret not configured on WordPress side'
      if (status === 404) message = 'PNL Sync plugin not found — is it installed and activated?'
      return { success: false, message }
    }
  }

  // ─── Products ───────────────────────────────────────────────────────────────

  async getProductPage(params: {
    page: number
    perPage?: number
    modifiedAfter?: string
  }): Promise<PluginProductPage> {
    const queryParams: Record<string, string | number> = {
      page:     params.page,
      per_page: params.perPage ?? 200,
    }
    if (params.modifiedAfter) {
      queryParams.modified_after = params.modifiedAfter
    }

    const res = await this.client.get<PluginProductPage>('/products', { params: queryParams })
    return res.data
  }

  /**
   * Stream all products, calling onPage for each page as it arrives.
   * Products include inline variations — no extra API calls needed.
   *
   * @param params.modifiedAfter  ISO timestamp for incremental sync
   * @param params.perPage        Products per page (default 200, max 500)
   * @param params.onPage         Called for each page of products
   * @param params.onProgress     Progress callback
   */
  async streamProducts(params: {
    modifiedAfter?: string
    perPage?: number
    onPage: (products: PluginProduct[], pageInfo: { page: number; totalPages: number; total: number }) => Promise<void>
    onProgress?: (fetched: number, total: number) => void
  }): Promise<void> {
    const perPage = params.perPage ?? 100  // 100 thay vì 200 — giảm tải query cho WC server
    let page = 1
    let totalFetched = 0
    let totalProducts = 0
    let totalPages = 1

    while (true) {
      const data = await this.getProductPage({
        page,
        perPage: params.perPage ?? 200,
        modifiedAfter: params.modifiedAfter,
      })

      totalProducts = data.total
      totalPages    = data.total_pages
      totalFetched += data.products.length

      params.onProgress?.(totalFetched, totalProducts)

      await params.onPage(data.products, {
        page:       data.page,
        totalPages: data.total_pages,
        total:      data.total,
      })

      if (!data.has_more) break
      page++
    }
  }

  // ─── Orders ─────────────────────────────────────────────────────────────────

  async getOrderPage(params: {
    page: number
    perPage?: number
    modifiedAfter?: string
    status?: string
  }): Promise<PluginOrderPage> {
    const queryParams: Record<string, string | number> = {
      page:     params.page,
      per_page: params.perPage ?? 100,
    }

    if (params.modifiedAfter) queryParams.modified_after = params.modifiedAfter
    if (params.status)        queryParams.status         = params.status

    try {
      const res = await this.client.get<PluginOrderPage>('/orders', { params: queryParams })
      return res.data
    } catch (error: any) {
      console.error('[WcPluginClient] getOrderPage failed:', {
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        data: error?.response?.data,
        params: queryParams,
      })
      throw error
    }
  }

  async streamOrders(params: {
    modifiedAfter?: string
    perPage?: number
    onPage: (orders: PluginOrder[], pageInfo: { page: number; totalPages: number; total: number }) => Promise<void>
    onProgress?: (fetched: number, total: number) => void
  }): Promise<void> {
    const perPage = params.perPage ?? 100  // 100 thay vì 200 — consistent với products
    let page = 1
    let totalFetched = 0

    while (true) {
      const data = await this.getOrderPage({
        page,
        perPage,
        modifiedAfter: params.modifiedAfter,
      })

      totalFetched += data.orders.length
      params.onProgress?.(totalFetched, data.total)

      await params.onPage(data.orders, {
        page:       data.page,
        totalPages: data.total_pages,
        total:      data.total,
      })

      if (!data.has_more) break
      page++
    }
  }
}
