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
  line_items: Array<{
    id: number
    sku: string
    name: string
    quantity: number
    price: string
  }>
  shipping_lines: Array<{
    price: string
  }>
  gateway?: string
  landing_site_ref?: string
}

export interface ShopbaseProduct {
  id: number
  title: string
  variants: Array<{
    id: number
    sku: string
    title: string
    price: string
    inventory_quantity: number
  }>
}

export class ShopbaseClient {
  private client: AxiosInstance
  private storeUrl: string
  private apiKey: string

  constructor(storeUrl: string, encryptedApiKey: string) {
    this.storeUrl = storeUrl.replace(/\/$/, '') // Remove trailing slash
    this.apiKey = decrypt(encryptedApiKey)
    
    this.client = axios.create({
      baseURL: `${this.storeUrl}/admin`,
      headers: {
        'X-ShopBase-Access-Token': this.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
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
        message: error.response?.data?.errors || error.message || 'Cannot connect',
      }
    }
  }

  async getOrders(params: {
    createdAtMin?: string
    createdAtMax?: string
    updatedAtMin?: string
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
      if (params.status) queryParams.status = params.status

      const response = await this.client.get('/orders.json', { params: queryParams })
      
      // Rate limiting: wait 500ms between requests (2 req/sec)
      await this.sleep(500)
      
      return response.data.orders || []
    } catch (error: any) {
      console.error('Shopbase getOrders error:', error.response?.data || error.message)
      throw new Error(error.response?.data?.errors || 'Failed to fetch orders')
    }
  }

  async getOrder(orderId: number): Promise<ShopbaseOrder> {
    try {
      const response = await this.client.get(`/orders/${orderId}.json`)
      await this.sleep(500)
      return response.data.order
    } catch (error: any) {
      console.error('Shopbase getOrder error:', error.response?.data || error.message)
      throw new Error(error.response?.data?.errors || 'Failed to fetch order')
    }
  }

  async getProducts(params: {
    limit?: number
    page?: number
  }): Promise<ShopbaseProduct[]> {
    try {
      const queryParams = {
        limit: params.limit || 50,
        page: params.page || 1,
      }

      const response = await this.client.get('/products.json', { params: queryParams })
      await this.sleep(500)
      
      return response.data.products || []
    } catch (error: any) {
      console.error('Shopbase getProducts error:', error.response?.data || error.message)
      throw new Error(error.response?.data?.errors || 'Failed to fetch products')
    }
  }

  async getAllProducts(): Promise<ShopbaseProduct[]> {
    const allProducts: ShopbaseProduct[] = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      const products = await this.getProducts({ page, limit: 50 })
      allProducts.push(...products)
      
      if (products.length < 50) {
        hasMore = false
      } else {
        page++
      }
    }

    return allProducts
  }

  async getAllOrders(params: {
    createdAtMin?: string
    createdAtMax?: string
  }): Promise<ShopbaseOrder[]> {
    const allOrders: ShopbaseOrder[] = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      const orders = await this.getOrders({ 
        ...params, 
        page, 
        limit: 50 
      })
      allOrders.push(...orders)
      
      if (orders.length < 50) {
        hasMore = false
      } else {
        page++
      }
    }

    return allOrders
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
