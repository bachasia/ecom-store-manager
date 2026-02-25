/**
 * Ads Cost Allocation
 * 
 * Allocates advertising costs to orders based on different attribution methods
 */

interface Order {
  id: string
  storeId: string
  orderDate: Date
  total: number
  allocatedAdsCost?: number
}

interface AdsCost {
  id: string
  storeId: string
  date: Date
  platform: string
  campaignName?: string | null
  adsetName?: string | null
  spend: number
}

export type AllocationMethod = 'equal' | 'revenue-weighted' | 'none'

/**
 * Allocate ads costs to orders using equal split method
 * Each order on a given day gets an equal share of that day's ad spend
 * 
 * @param orders - Array of orders to allocate costs to
 * @param adsCosts - Array of ads costs to allocate
 * @returns Orders with allocated ads costs
 */
export function allocateAdsCostsEqual(
  orders: Order[],
  adsCosts: AdsCost[]
): Order[] {
  if (orders.length === 0 || adsCosts.length === 0) {
    return orders.map(order => ({ ...order, allocatedAdsCost: 0 }))
  }

  // Group ads costs by date and store
  const adsCostsByDateStore = new Map<string, number>()
  
  adsCosts.forEach(adsCost => {
    const dateKey = `${adsCost.storeId}_${adsCost.date.toISOString().split('T')[0]}`
    const currentSpend = adsCostsByDateStore.get(dateKey) || 0
    adsCostsByDateStore.set(dateKey, currentSpend + Number(adsCost.spend))
  })

  // Group orders by date and store
  const ordersByDateStore = new Map<string, Order[]>()
  
  orders.forEach(order => {
    const dateKey = `${order.storeId}_${order.orderDate.toISOString().split('T')[0]}`
    const ordersForDate = ordersByDateStore.get(dateKey) || []
    ordersForDate.push(order)
    ordersByDateStore.set(dateKey, ordersForDate)
  })

  // Allocate costs equally
  const allocatedOrders = orders.map(order => {
    const dateKey = `${order.storeId}_${order.orderDate.toISOString().split('T')[0]}`
    const totalSpendForDate = adsCostsByDateStore.get(dateKey) || 0
    const ordersForDate = ordersByDateStore.get(dateKey) || []
    
    if (ordersForDate.length === 0 || totalSpendForDate === 0) {
      return { ...order, allocatedAdsCost: 0 }
    }

    const allocatedCost = totalSpendForDate / ordersForDate.length
    
    return {
      ...order,
      allocatedAdsCost: Math.round(allocatedCost * 100) / 100
    }
  })

  return allocatedOrders
}

/**
 * Allocate ads costs to orders using revenue-weighted method
 * Orders with higher revenue get a proportionally larger share of ad spend
 * 
 * @param orders - Array of orders to allocate costs to
 * @param adsCosts - Array of ads costs to allocate
 * @returns Orders with allocated ads costs
 */
export function allocateAdsCostsRevenueWeighted(
  orders: Order[],
  adsCosts: AdsCost[]
): Order[] {
  if (orders.length === 0 || adsCosts.length === 0) {
    return orders.map(order => ({ ...order, allocatedAdsCost: 0 }))
  }

  // Group ads costs by date and store
  const adsCostsByDateStore = new Map<string, number>()
  
  adsCosts.forEach(adsCost => {
    const dateKey = `${adsCost.storeId}_${adsCost.date.toISOString().split('T')[0]}`
    const currentSpend = adsCostsByDateStore.get(dateKey) || 0
    adsCostsByDateStore.set(dateKey, currentSpend + Number(adsCost.spend))
  })

  // Group orders by date and store, calculate total revenue per date
  const ordersByDateStore = new Map<string, Order[]>()
  const totalRevenueByDateStore = new Map<string, number>()
  
  orders.forEach(order => {
    const dateKey = `${order.storeId}_${order.orderDate.toISOString().split('T')[0]}`
    
    // Add to orders list
    const ordersForDate = ordersByDateStore.get(dateKey) || []
    ordersForDate.push(order)
    ordersByDateStore.set(dateKey, ordersForDate)
    
    // Add to total revenue
    const currentRevenue = totalRevenueByDateStore.get(dateKey) || 0
    totalRevenueByDateStore.set(dateKey, currentRevenue + Number(order.total))
  })

  // Allocate costs based on revenue weight
  const allocatedOrders = orders.map(order => {
    const dateKey = `${order.storeId}_${order.orderDate.toISOString().split('T')[0]}`
    const totalSpendForDate = adsCostsByDateStore.get(dateKey) || 0
    const totalRevenueForDate = totalRevenueByDateStore.get(dateKey) || 0
    
    if (totalRevenueForDate === 0 || totalSpendForDate === 0) {
      return { ...order, allocatedAdsCost: 0 }
    }

    // Calculate this order's share based on its revenue proportion
    const revenueWeight = Number(order.total) / totalRevenueForDate
    const allocatedCost = totalSpendForDate * revenueWeight
    
    return {
      ...order,
      allocatedAdsCost: Math.round(allocatedCost * 100) / 100
    }
  })

  return allocatedOrders
}

/**
 * Allocate ads costs to orders based on specified method
 * 
 * @param orders - Array of orders to allocate costs to
 * @param adsCosts - Array of ads costs to allocate
 * @param method - Allocation method ('equal' | 'revenue-weighted' | 'none')
 * @returns Orders with allocated ads costs
 */
export function allocateAdsCosts(
  orders: Order[],
  adsCosts: AdsCost[],
  method: AllocationMethod = 'revenue-weighted'
): Order[] {
  switch (method) {
    case 'equal':
      return allocateAdsCostsEqual(orders, adsCosts)
    
    case 'revenue-weighted':
      return allocateAdsCostsRevenueWeighted(orders, adsCosts)
    
    case 'none':
      return orders.map(order => ({ ...order, allocatedAdsCost: 0 }))
    
    default:
      throw new Error(`Unknown allocation method: ${method}`)
  }
}

/**
 * Get total allocated ads cost for a set of orders
 * 
 * @param orders - Array of orders with allocated costs
 * @returns Total allocated ads cost
 */
export function getTotalAllocatedAdsCost(orders: Order[]): number {
  const total = orders.reduce((sum, order) => {
    return sum + (order.allocatedAdsCost || 0)
  }, 0)
  
  return Math.round(total * 100) / 100
}

/**
 * Get ads cost allocation summary by date
 * 
 * @param orders - Array of orders with allocated costs
 * @returns Map of date to total allocated cost
 */
export function getAdsCostAllocationByDate(
  orders: Order[]
): Map<string, { orderCount: number; totalRevenue: number; allocatedCost: number }> {
  const summary = new Map<string, { orderCount: number; totalRevenue: number; allocatedCost: number }>()
  
  orders.forEach(order => {
    const dateKey = order.orderDate.toISOString().split('T')[0]
    const current = summary.get(dateKey) || { orderCount: 0, totalRevenue: 0, allocatedCost: 0 }
    
    summary.set(dateKey, {
      orderCount: current.orderCount + 1,
      totalRevenue: current.totalRevenue + Number(order.total),
      allocatedCost: current.allocatedCost + (order.allocatedAdsCost || 0)
    })
  })
  
  return summary
}
