import axios, { AxiosInstance } from 'axios'
import { decrypt } from '@/lib/encryption'

export interface ShopbaseOrder {
  id: number
  order_number: string
  created_at: string
  updated_at: string
  total_price: string
  subtotal_price: string
  total_discounts: string
  total_tax: string
  financial_status: string
  fulfillment_status: string
  customer: {
    email: string
    first_name: string
    last_name: string
    default_address?: {
      country: string
    }
  }
  billing_address?: {
    first_name?: string
    last_name?: string
    address1?: string
    address2?: string
    city?: string
    province?: string
    zip?: string
    country?: string
    phone?: string
  }
  shipping_address?: {
    first_name?: string
    last_name?: string
    address1?: string
    address2?: string
    city?: string
    province?: string
    zip?: string
    country?: string
    phone?: string
  }
  line_items: Array<{
    id: number
    sku: string
    variant_id?: number
    product_id?: number
    name: string
    quantity: number
    price: string
  }>
  shipping_lines: Array<{
    price: string
  }>
  gateway?: string
  payment_gateway_names?: string[]
  source_name?: string
  referring_site?: string
  landing_site?: string
  landing_site_ref?: string
  note_attributes?: Array<{
    name?: string
    value?: string
  }>
}

export interface ShopbaseProduct {
  id: number
  title: string
  updated_at: string  // ISO 8601 — dùng để skip-unchanged khi incremental sync
  images: Array<{
    id: number
    src: string
    variant_ids: number[]  // variant IDs sử dụng ảnh này
  }>
  variants: Array<{
    id: number
    sku: string
    title: string
    price: string
    inventory_quantity: number
    image_id: number | null  // ID của ảnh gắn với variant này
  }>
}

export class ShopbaseClient {
  private client: AxiosInstance
  private storeUrl: string

  constructor(storeUrl: string, encryptedApiKey: string, encryptedApiSecret: string) {
    this.storeUrl = storeUrl.replace(/\/$/, '') // Remove trailing slash
    const apiKey = decrypt(encryptedApiKey)
    const apiPassword = decrypt(encryptedApiSecret)

    this.client = axios.create({
      baseURL: `${this.storeUrl}/admin`,
      auth: {
        username: apiKey,
        password: apiPassword,
      },
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    })
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.withRetry(() => this.client.get('/shop.json'))
      return {
        success: true,
        message: `Successfully connected to ${response.data.shop?.name || 'store'}`,
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.errors || error.response?.data?.error || error.message || 'Cannot connect',
      }
    }
  }

  async getOrders(params: {
    createdAtMin?: string
    createdAtMax?: string
    updatedAtMin?: string
    orderStatus?: string
    financialStatus?: string
    fulfillmentStatus?: string
    limit?: number
    page?: number
    status?: string
  }): Promise<ShopbaseOrder[]> {
    try {
      const queryParams: any = {
        limit: params.limit || 50,
        page: params.page || 1,
      }

      if (params.createdAtMin) queryParams.created_at_min = params.createdAtMin
      if (params.createdAtMax) queryParams.created_at_max = params.createdAtMax
      if (params.updatedAtMin) queryParams.updated_at_min = params.updatedAtMin
      if (params.orderStatus) queryParams.order_status = params.orderStatus
      if (params.financialStatus) queryParams.financial_status = params.financialStatus
      if (params.fulfillmentStatus) queryParams.fulfillment_status = params.fulfillmentStatus
      if (params.status) queryParams.status = params.status

      const response = await this.withRetry(() =>
        this.client.get('/orders.json', { params: queryParams })
      )
      // Rate limiting: wait 500ms between requests (2 req/sec)
      await this.sleep(500)
      return response.data.orders || []
    } catch (error: any) {
      console.error('Shopbase getOrders error:', error.response?.data || error.message)
      const errMsg = error.response?.data?.errors || error.response?.data?.error || error.message || 'Failed to fetch orders'
      throw new Error(errMsg)
    }
  }

  async getOrder(orderId: number, timeoutMs = 10000): Promise<ShopbaseOrder> {
    try {
      const response = await this.withRetry(() =>
        this.client.get(`/orders/${orderId}.json`, { timeout: timeoutMs })
      )
      await this.sleep(500)
      return response.data.order
    } catch (error: any) {
      console.error('Shopbase getOrder error:', error.response?.data || error.message)
      const errMsg = error.response?.data?.errors || error.response?.data?.error || error.message || 'Failed to fetch order'
      throw new Error(errMsg)
    }
  }

  async getProducts(params: {
    limit?: number
    page?: number
  }): Promise<ShopbaseProduct[]> {
    const limit = params.limit || 50
    try {
      const queryParams = {
        limit,
        page: params.page || 1,
      }

      const response = await this.withRetry(() =>
        this.client.get('/products.json', { params: queryParams })
      )
      await this.sleep(500)
      return response.data.products || []
    } catch (error: any) {
      console.error('Shopbase getProducts error:', error.response?.data || error.message)
      const errMsg = error.response?.data?.errors || error.response?.data?.error || error.message || 'Failed to fetch products'
      throw new Error(errMsg)
    }
  }

  async getAllProducts(): Promise<ShopbaseProduct[]> {
    const allProducts: ShopbaseProduct[] = []
    const PAGE_SIZE = 50
    let page = 1

    while (true) {
      const products = await this.getProducts({ page, limit: PAGE_SIZE })
      allProducts.push(...products)
      if (products.length < PAGE_SIZE) break
      page++
    }

    return allProducts
  }

  /**
   * Stream products page by page — không load toàn bộ vào RAM.
   * Dùng cho store có nhiều sản phẩm để tránh timeout và OOM.
   */
  async streamAllProducts(options: {
    onPage: (products: ShopbaseProduct[], pageInfo: { page: number; fetched: number; skipped: number }) => Promise<void>
    onProgress?: (fetched: number) => void
    pageSize?: number
    /**
     * Nếu truyền vào, các product có updated_at <= sinceDate sẽ được bỏ qua
     * (không gọi onPage cho chúng). ShopBase không hỗ trợ filter updated_at_min
     * cho products nên ta vẫn phải fetch tất cả pages nhưng skip ở client.
     */
    sinceDate?: Date
  }): Promise<{ totalFetched: number; totalSkipped: number }> {
    const PAGE_SIZE = options.pageSize ?? 50
    let page = 1
    let totalFetched = 0
    let totalSkipped = 0

    while (true) {
      const products = await this.getProducts({ page, limit: PAGE_SIZE })
      totalFetched += products.length

      // Lọc bỏ products không thay đổi kể từ sinceDate
      const toProcess = options.sinceDate
        ? products.filter(p => new Date(p.updated_at) > options.sinceDate!)
        : products
      totalSkipped += products.length - toProcess.length

      if (toProcess.length > 0) {
        await options.onPage(toProcess, { page, fetched: totalFetched, skipped: totalSkipped })
      }
      options.onProgress?.(totalFetched)

      if (products.length < PAGE_SIZE) break
      page++
    }

    return { totalFetched, totalSkipped }
  }

  async getAllOrders(params: {
    createdAtMin?: string
    createdAtMax?: string
    updatedAtMin?: string
    orderStatus?: string
    financialStatus?: string
    fulfillmentStatus?: string
    status?: string
  }): Promise<ShopbaseOrder[]> {
    const allOrders: ShopbaseOrder[] = []
    const PAGE_SIZE = 50
    let page = 1

    while (true) {
      const orders = await this.getOrders({ ...params, page, limit: PAGE_SIZE })
      allOrders.push(...orders)
      if (orders.length < PAGE_SIZE) break
      page++
    }

    return allOrders
  }

  /**
   * Retry wrapper — tối đa maxAttempts lần, exponential backoff.
   * - 429: đọc Retry-After header, chờ đúng thời gian yêu cầu
   * - 5xx: backoff 1s → 2s → 4s
   * - 401/403/404: không retry, throw ngay
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    maxAttempts = 3,
    baseDelayMs = 1000
  ): Promise<T> {
    let lastError: any
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn()
      } catch (error: any) {
        lastError = error
        const status = error.response?.status

        // Không retry với lỗi auth hoặc not found
        if (status === 401 || status === 403 || status === 404) throw error

        if (attempt === maxAttempts) break

        if (status === 429) {
          // Đọc Retry-After header (giây), fallback về 10s
          const retryAfter = parseInt(error.response?.headers?.['retry-after'] || '10', 10)
          console.warn(`[shopbase] 429 Too Many Requests — waiting ${retryAfter}s before retry ${attempt + 1}/${maxAttempts}`)
          await this.sleep(retryAfter * 1000)
        } else {
          // 5xx hoặc network error — exponential backoff
          const delay = baseDelayMs * Math.pow(2, attempt - 1)
          console.warn(`[shopbase] Error (status=${status ?? 'network'}) — backoff ${delay}ms before retry ${attempt + 1}/${maxAttempts}`)
          await this.sleep(delay)
        }
      }
    }
    throw lastError
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
