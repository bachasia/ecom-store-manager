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
      const response = await this.client.get('/shop.json')
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

      const response = await this.client.get('/orders.json', { params: queryParams })
      
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
      const response = await this.client.get(`/orders/${orderId}.json`, { timeout: timeoutMs })
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

      const response = await this.client.get('/products.json', { params: queryParams })
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
    onPage: (products: ShopbaseProduct[], pageInfo: { page: number; fetched: number }) => Promise<void>
    onProgress?: (fetched: number) => void
    pageSize?: number
  }): Promise<{ totalFetched: number }> {
    const PAGE_SIZE = options.pageSize ?? 50
    let page = 1
    let totalFetched = 0

    while (true) {
      const products = await this.getProducts({ page, limit: PAGE_SIZE })
      totalFetched += products.length

      await options.onPage(products, { page, fetched: totalFetched })
      options.onProgress?.(totalFetched)

      if (products.length < PAGE_SIZE) break
      page++
    }

    return { totalFetched }
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

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
