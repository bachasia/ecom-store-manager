import axios, { AxiosInstance } from 'axios'
import { decrypt } from '@/lib/encryption'

export interface WooCommerceOrder {
  id: number
  number: string
  date_created: string
  date_modified: string
  status: string
  total: string
  subtotal: string
  discount_total: string
  shipping_total: string
  total_tax: string
  customer_id: number
  billing: {
    email: string
    first_name: string
    last_name: string
    country: string
  }
  line_items: Array<{
    id: number
    sku: string
    name: string
    quantity: number
    price: number
    total: string
  }>
  payment_method: string
  payment_method_title: string
  refunds: Array<{
    id: number
    total: string
  }>
}

export interface WooCommerceProduct {
  id: number
  name: string
  sku: string
  price: string
  type: string
  variations?: number[]
}

export interface WooCommerceVariation {
  id: number
  sku: string
  price: string
  attributes: Array<{
    name: string
    option: string
  }>
}

export class WooCommerceClient {
  private client: AxiosInstance
  private storeUrl: string
  private consumerKey: string
  private consumerSecret: string

  constructor(storeUrl: string, encryptedConsumerKey: string, encryptedConsumerSecret: string) {
    this.storeUrl = storeUrl.replace(/\/$/, '')
    this.consumerKey = decrypt(encryptedConsumerKey)
    this.consumerSecret = decrypt(encryptedConsumerSecret)
    
    this.client = axios.create({
      baseURL: `${this.storeUrl}/wp-json/wc/v3`,
      auth: {
        username: this.consumerKey,
        password: this.consumerSecret,
      },
      timeout: 30000,
    })
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.client.get('/system_status')
      return {
        success: true,
        message: 'Successfully connected to WooCommerce',
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Cannot connect',
      }
    }
  }

  async getOrders(params: {
    after?: string
    before?: string
    modifiedAfter?: string
    perPage?: number
    page?: number
    status?: string
  }): Promise<WooCommerceOrder[]> {
    try {
      const queryParams: any = {
        per_page: params.perPage || 100,
        page: params.page || 1,
      }

      if (params.after) queryParams.after = params.after
      if (params.before) queryParams.before = params.before
      if (params.modifiedAfter) queryParams.modified_after = params.modifiedAfter
      if (params.status) queryParams.status = params.status

      const response = await this.client.get('/orders', { params: queryParams })
      
      return response.data || []
    } catch (error: any) {
      console.error('WooCommerce getOrders error:', error.response?.data || error.message)
      throw new Error(error.response?.data?.message || 'Failed to fetch orders')
    }
  }

  async getOrder(orderId: number): Promise<WooCommerceOrder> {
    try {
      const response = await this.client.get(`/orders/${orderId}`)
      return response.data
    } catch (error: any) {
      console.error('WooCommerce getOrder error:', error.response?.data || error.message)
      throw new Error(error.response?.data?.message || 'Failed to fetch order')
    }
  }

  async getProducts(params: {
    perPage?: number
    page?: number
  }): Promise<WooCommerceProduct[]> {
    try {
      const queryParams = {
        per_page: params.perPage || 100,
        page: params.page || 1,
      }

      const response = await this.client.get('/products', { params: queryParams })
      
      return response.data || []
    } catch (error: any) {
      console.error('WooCommerce getProducts error:', error.response?.data || error.message)
      throw new Error(error.response?.data?.message || 'Failed to fetch products')
    }
  }

  async getProductVariations(productId: number): Promise<WooCommerceVariation[]> {
    try {
      const response = await this.client.get(`/products/${productId}/variations`, {
        params: { per_page: 100 }
      })
      
      return response.data || []
    } catch (error: any) {
      console.error('WooCommerce getProductVariations error:', error.response?.data || error.message)
      throw new Error(error.response?.data?.message || 'Failed to fetch variations')
    }
  }

  async getAllProducts(): Promise<WooCommerceProduct[]> {
    const allProducts: WooCommerceProduct[] = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      const products = await this.getProducts({ page, perPage: 100 })
      allProducts.push(...products)
      
      if (products.length < 100) {
        hasMore = false
      } else {
        page++
      }
    }

    return allProducts
  }

  async getAllOrders(params: {
    after?: string
    before?: string
  }): Promise<WooCommerceOrder[]> {
    const allOrders: WooCommerceOrder[] = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      const orders = await this.getOrders({ 
        ...params, 
        page, 
        perPage: 100 
      })
      allOrders.push(...orders)
      
      if (orders.length < 100) {
        hasMore = false
      } else {
        page++
      }
    }

    return allOrders
  }
}
