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
    address_1?: string
    address_2?: string
    city?: string
    state?: string
    postcode?: string
    country: string
  }
  shipping?: {
    first_name?: string
    last_name?: string
    address_1?: string
    address_2?: string
    city?: string
    state?: string
    postcode?: string
    country?: string
  }
  meta_data?: Array<{
    key: string
    value: any
  }>
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
  images: Array<{
    id: number
    src: string
  }>
}

export interface WooCommerceVariation {
  id: number
  sku: string
  price: string
  attributes: Array<{
    name: string
    option: string
  }>
  image: {
    id: number
    src: string
  } | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Retry wrapper với exponential backoff.
 * Retry khi: timeout (ECONNABORTED / ETIMEDOUT), 429, 502, 503, hoặc network error.
 * KHÔNG retry khi: 400, 401, 403, 404 (client error cố định).
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; baseDelayMs?: number; label?: string } = {}
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3
  const baseDelayMs = opts.baseDelayMs ?? 2000
  const label = opts.label ?? 'WooCommerce request'

  let lastError: any

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error
      const status = error?.response?.status
      const isTimeout = error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT' || error?.message?.includes('timeout')
      const isServerError = status === 429 || status === 502 || status === 503 || status === 504
      const isNetworkError = !status && !error?.response

      const isRetryable = isTimeout || isServerError || isNetworkError

      if (attempt === maxRetries || !isRetryable) {
        // Với lỗi không retry được (4xx cố định), ném lỗi gốc ngay
        throw error
      }

      // Exponential backoff: 2s, 4s, 8s
      const delay = baseDelayMs * Math.pow(2, attempt)
      const retryAfter = error?.response?.headers?.['retry-after']
      const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : delay

      const reason = isTimeout ? 'timeout' : `HTTP ${status ?? 'network'}`
      console.warn(
        `[WooCommerce] ${label} failed (${reason}), ` +
        `retry ${attempt + 1}/${maxRetries} in ${(waitMs / 1000).toFixed(1)}s`
      )
      await sleep(waitMs)
    }
  }

  throw lastError
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class WooCommerceClient {
  private client: AxiosInstance
  private storeUrl: string
  private consumerKey: string
  private consumerSecret: string

  /**
   * Delay giữa các page requests — bảo vệ WP server khỏi bị quá tải.
   * 0       = không delay (nhanh nhất, rủi ro nhất với store lớn)
   * 150-300 = an toàn cho VPS/dedicated server
   * 500+    = conservative cho shared hosting
   */
  private requestDelayMs: number

  /**
   * Timeout cho mỗi HTTP request.
   * WooCommerce REST API với store lớn (20k+ products) có thể mất 30-60s/page.
   * Default: 60s
   */
  private timeoutMs: number

  constructor(
    storeUrl: string,
    encryptedConsumerKey: string,
    encryptedConsumerSecret: string,
    options: {
      requestDelayMs?: number
      timeoutMs?: number
    } = {}
  ) {
    this.storeUrl = storeUrl.replace(/\/$/, '')
    this.consumerKey = decrypt(encryptedConsumerKey)
    this.consumerSecret = decrypt(encryptedConsumerSecret)
    this.requestDelayMs = options.requestDelayMs ?? 200
    this.timeoutMs = options.timeoutMs ?? 60000  // 60s — đủ cho server chậm

    this.client = axios.create({
      baseURL: `${this.storeUrl}/wp-json/wc/v3`,
      auth: {
        username: this.consumerKey,
        password: this.consumerSecret,
      },
      timeout: this.timeoutMs,
    })
  }

  // ─── Connection test ────────────────────────────────────────────────────────

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.client.get('/system_status', { timeout: 15000 })
      return { success: true, message: 'Successfully connected to WooCommerce' }
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Cannot connect',
      }
    }
  }

  // ─── Orders ─────────────────────────────────────────────────────────────────

  async getOrders(params: {
    after?: string
    before?: string
    modifiedAfter?: string
    perPage?: number
    page?: number
    status?: string
  }): Promise<WooCommerceOrder[]> {
    const queryParams: any = {
      per_page: params.perPage || 100,
      page: params.page || 1,
    }
    if (params.after) queryParams.after = params.after
    if (params.before) queryParams.before = params.before
    if (params.modifiedAfter) queryParams.modified_after = params.modifiedAfter
    if (params.status) queryParams.status = params.status

    return withRetry(
      () => this.client.get('/orders', { params: queryParams }).then(r => r.data || []),
      { label: `getOrders page=${params.page ?? 1}` }
    )
  }

  async getOrder(orderId: number): Promise<WooCommerceOrder> {
    return withRetry(
      () => this.client.get(`/orders/${orderId}`).then(r => r.data),
      { label: `getOrder id=${orderId}` }
    )
  }

  async getAllOrders(params: {
    after?: string
    before?: string
    modifiedAfter?: string
  } = {}): Promise<WooCommerceOrder[]> {
    const allOrders: WooCommerceOrder[] = []
    const PAGE_SIZE = 100
    let page = 1

    while (true) {
      const orders = await this.getOrders({ ...params, page, perPage: PAGE_SIZE })
      allOrders.push(...orders)

      if (orders.length < PAGE_SIZE) break
      page++

      if (this.requestDelayMs > 0) await sleep(this.requestDelayMs)
    }

    return allOrders
  }

  // ─── Products ───────────────────────────────────────────────────────────────

  async getProducts(params: {
    perPage?: number
    page?: number
    modifiedAfter?: string
  }): Promise<WooCommerceProduct[]> {
    const queryParams: any = {
      per_page: params.perPage || 50,  // 50 thay vì 100 — nhẹ hơn cho server
      page: params.page || 1,
    }
    if (params.modifiedAfter) queryParams.modified_after = params.modifiedAfter

    return withRetry(
      () => this.client.get('/products', { params: queryParams }).then(r => r.data || []),
      { label: `getProducts page=${params.page ?? 1}`, baseDelayMs: 3000 }
    )
  }

  async getProductVariations(productId: number): Promise<WooCommerceVariation[]> {
    const allVariations: WooCommerceVariation[] = []
    const PAGE_SIZE = 100
    let page = 1

    while (true) {
      const variations: WooCommerceVariation[] = await withRetry(
        () => this.client.get(`/products/${productId}/variations`, {
          params: { per_page: PAGE_SIZE, page }
        }).then(r => r.data || []),
        { label: `getVariations pid=${productId} page=${page}`, baseDelayMs: 2000 }
      )

      allVariations.push(...variations)
      if (variations.length < PAGE_SIZE) break
      page++

      if (this.requestDelayMs > 0) await sleep(this.requestDelayMs)
    }

    return allVariations
  }

  /**
   * Stream tất cả products với rate limiting, xử lý từng product ngay khi có kết quả.
   *
   * Thay vì tích lũy toàn bộ rồi return, hàm này gọi `onProduct` callback ngay khi
   * mỗi product (kèm variations nếu là variable) đã sẵn sàng — cho phép caller
   * upsert vào DB song song với quá trình fetch, không cần đợi tất cả xong.
   *
   * Chiến lược:
   *  - Phase 1: Fetch product listing theo page (per_page=50)
   *  - Với simple product: gọi onProduct ngay
   *  - Với variable product: fetch variations rồi gọi onProduct
   *  - Concurrency: tối đa `variationConcurrency` variation requests chạy song song
   *
   * @param params.modifiedAfter        ISO timestamp — incremental sync
   * @param params.variationConcurrency Số variation requests song song (default: 3)
   * @param params.onProduct            Callback nhận từng product khi sẵn sàng
   * @param params.onProgress           Callback tiến trình tổng quát
   */
  async streamAllProducts(params: {
    modifiedAfter?: string
    variationConcurrency?: number
    onProduct: (product: WooCommerceProduct, variations: WooCommerceVariation[]) => Promise<void>
    onProgress?: (event: {
      pagesFetched: number
      simpleProcessed: number
      variableProcessed: number
      variableTotal: number
    }) => void
  }): Promise<{ simpleCount: number; variableCount: number; errorCount: number }> {
    const PAGE_SIZE = 50
    const concurrency = params.variationConcurrency ?? 3

    let pagesFetched = 0
    let simpleProcessed = 0
    let variableProcessed = 0
    let errorCount = 0

    // Queue của variable products chờ fetch variations
    const variableQueue: WooCommerceProduct[] = []
    let variableTotal = 0    // tổng số variable products đã thấy
    let fetchingDone = false  // Phase 1 hoàn tất chưa

    // ── Variation worker: chạy song song, drain queue ────────────────────────
    const processVariableProduct = async (product: WooCommerceProduct) => {
      try {
        const variations = await this.getProductVariations(product.id)
        await params.onProduct(product, variations)
        variableProcessed++
      } catch (err: any) {
        console.error(
          `[WooCommerce] Failed to process variable product id=${product.id} "${product.name}":`,
          err?.message ?? err
        )
        errorCount++
        variableProcessed++  // vẫn count để progress không bị kẹt
      }
      params.onProgress?.({ pagesFetched, simpleProcessed, variableProcessed, variableTotal })
    }

    // ── Phase 1: Fetch product pages + stream simple products ngay ───────────
    const inFlight: Promise<void>[] = []
    let page = 1

    while (true) {
      const products = await this.getProducts({
        page,
        perPage: PAGE_SIZE,
        modifiedAfter: params.modifiedAfter,
      })
      pagesFetched++

      for (const p of products) {
        if (p.type === 'variable') {
          variableTotal++
          variableQueue.push(p)

          // Khi queue đủ 1 slot concurrency, fire ngay không đợi queue đầy
          if (inFlight.length < concurrency) {
            const job = processVariableProduct(variableQueue.shift()!)
            inFlight.push(job)
            // Tự clean khi xong
            job.finally(() => {
              const idx = inFlight.indexOf(job)
              if (idx !== -1) inFlight.splice(idx, 1)
            })
          }
        } else {
          // Simple product: callback ngay, không cần fetch thêm
          try {
            await params.onProduct(p, [])
            simpleProcessed++
          } catch (err: any) {
            console.error(
              `[WooCommerce] Failed to process simple product id=${p.id}:`,
              err?.message ?? err
            )
            errorCount++
          }
          params.onProgress?.({ pagesFetched, simpleProcessed, variableProcessed, variableTotal })
        }
      }

      if (products.length < PAGE_SIZE) break
      page++

      if (this.requestDelayMs > 0) await sleep(this.requestDelayMs)
    }

    fetchingDone = true

    // ── Drain remaining variable queue sau khi fetch xong ───────────────────
    while (variableQueue.length > 0) {
      const batch = variableQueue.splice(0, concurrency - inFlight.length || 1)
      const jobs = batch.map(p => {
        const job = processVariableProduct(p)
        inFlight.push(job)
        job.finally(() => {
          const idx = inFlight.indexOf(job)
          if (idx !== -1) inFlight.splice(idx, 1)
        })
        return job
      })
      await Promise.race(jobs.length > 0 ? jobs : [Promise.resolve()])
    }

    // Đợi tất cả in-flight jobs hoàn tất
    await Promise.allSettled(inFlight)

    return { simpleCount: simpleProcessed, variableCount: variableProcessed, errorCount }
  }

  /**
   * @deprecated Dùng streamAllProducts() để upsert song song với fetch.
   * Giữ lại để backward-compatible với code khác nếu có.
   */
  async getAllProducts(params: {
    modifiedAfter?: string
    variationConcurrency?: number
    onProgress?: (phase: 'products' | 'variations', fetched: number, total: number) => void
  } = {}): Promise<WooCommerceProduct[]> {
    const allProducts: WooCommerceProduct[] = []

    await this.streamAllProducts({
      modifiedAfter: params.modifiedAfter,
      variationConcurrency: params.variationConcurrency,
      onProduct: async (product, variations) => {
        ;(product as any)._fetchedVariations = variations
        allProducts.push(product)
      },
      onProgress: ({ pagesFetched, simpleProcessed, variableProcessed, variableTotal }) => {
        params.onProgress?.('products', simpleProcessed + variableProcessed, simpleProcessed + variableTotal)
      },
    })

    return allProducts
  }
}
