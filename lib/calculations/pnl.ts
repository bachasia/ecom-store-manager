/**
 * P&L (Profit & Loss) Calculation Engine
 * 
 * Calculates profit metrics for orders and aggregated data
 */

import { utcToLocalYMD } from "@/lib/utils/timezone"

interface Order {
  id: string
  total: number
  refundAmount: number
  totalCOGS: number
  transactionFee: number
  allocatedAdsCost: number
}

interface PLMetrics {
  revenue: number
  cogs: number
  grossProfit: number
  grossMargin: number
  transactionFees: number
  adsCosts: number
  netProfit: number
  profitMargin: number
  roas: number | null
}

/**
 * Calculate P&L metrics for a single order
 * 
 * @param order - Order with financial data
 * @returns P&L metrics
 */
export function calculateOrderPL(order: Order): {
  grossProfit: number
  netProfit: number
  profitMargin: number
} {
  // Revenue = Total - Refunds
  const revenue = Number(order.total) - Number(order.refundAmount)
  
  // Gross Profit = Revenue - COGS
  const grossProfit = revenue - Number(order.totalCOGS)
  
  // Net Profit = Gross Profit - Transaction Fee - Ads Cost
  const netProfit = grossProfit - Number(order.transactionFee) - Number(order.allocatedAdsCost)
  
  // Profit Margin = (Net Profit / Revenue) × 100
  const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0
  
  return {
    grossProfit: Math.round(grossProfit * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    profitMargin: Math.round(profitMargin * 100) / 100,
  }
}

/**
 * Calculate aggregated P&L metrics for multiple orders
 * 
 * @param orders - Array of orders
 * @returns Aggregated P&L metrics
 */
export function calculateAggregatePL(orders: Order[]): PLMetrics {
  if (orders.length === 0) {
    return {
      revenue: 0,
      cogs: 0,
      grossProfit: 0,
      grossMargin: 0,
      transactionFees: 0,
      adsCosts: 0,
      netProfit: 0,
      profitMargin: 0,
      roas: null,
    }
  }

  // Sum all values
  const totalRevenue = orders.reduce((sum, order) => {
    return sum + Number(order.total) - Number(order.refundAmount)
  }, 0)

  const totalCOGS = orders.reduce((sum, order) => {
    return sum + Number(order.totalCOGS)
  }, 0)

  const totalTransactionFees = orders.reduce((sum, order) => {
    return sum + Number(order.transactionFee)
  }, 0)

  const totalAdsCosts = orders.reduce((sum, order) => {
    return sum + Number(order.allocatedAdsCost)
  }, 0)

  // Calculate metrics
  const grossProfit = totalRevenue - totalCOGS
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0
  
  const netProfit = grossProfit - totalTransactionFees - totalAdsCosts
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0
  
  const roas = totalAdsCosts > 0 ? totalRevenue / totalAdsCosts : null

  return {
    revenue: Math.round(totalRevenue * 100) / 100,
    cogs: Math.round(totalCOGS * 100) / 100,
    grossProfit: Math.round(grossProfit * 100) / 100,
    grossMargin: Math.round(grossMargin * 100) / 100,
    transactionFees: Math.round(totalTransactionFees * 100) / 100,
    adsCosts: Math.round(totalAdsCosts * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    profitMargin: Math.round(profitMargin * 100) / 100,
    roas: roas ? Math.round(roas * 100) / 100 : null,
  }
}

/**
 * Calculate P&L metrics by date range
 * 
 * @param orders - Array of orders with orderDate
 * @returns Map of date to P&L metrics
 */
export function calculatePLByDate(
  orders: (Order & { orderDate: Date })[],
  timezone: string = "UTC"
): Map<string, PLMetrics> {
  const ordersByDate = new Map<string, (Order & { orderDate: Date })[]>()

  // Group orders by date
  orders.forEach(order => {
    const dateKey = utcToLocalYMD(order.orderDate, timezone)
    const ordersForDate = ordersByDate.get(dateKey) || []
    ordersForDate.push(order)
    ordersByDate.set(dateKey, ordersForDate)
  })

  // Calculate P&L for each date
  const plByDate = new Map<string, PLMetrics>()
  
  ordersByDate.forEach((ordersForDate, dateKey) => {
    const metrics = calculateAggregatePL(ordersForDate)
    plByDate.set(dateKey, metrics)
  })

  return plByDate
}

/**
 * Calculate P&L metrics by month
 * 
 * @param orders - Array of orders with orderDate
 * @returns Map of month (YYYY-MM) to P&L metrics
 */
export function calculatePLByMonth(
  orders: (Order & { orderDate: Date })[],
  timezone: string = "UTC"
): Map<string, PLMetrics> {
  const ordersByMonth = new Map<string, (Order & { orderDate: Date })[]>()

  // Group orders by month
  orders.forEach(order => {
    const monthKey = utcToLocalYMD(order.orderDate, timezone).substring(0, 7)
    const ordersForMonth = ordersByMonth.get(monthKey) || []
    ordersForMonth.push(order)
    ordersByMonth.set(monthKey, ordersForMonth)
  })

  // Calculate P&L for each month
  const plByMonth = new Map<string, PLMetrics>()
  
  ordersByMonth.forEach((ordersForMonth, monthKey) => {
    const metrics = calculateAggregatePL(ordersForMonth)
    plByMonth.set(monthKey, metrics)
  })

  return plByMonth
}

/**
 * Calculate P&L metrics by product SKU
 * 
 * @param orderItems - Array of order items with order data
 * @returns Map of SKU to P&L metrics
 */
export function calculatePLByProduct(
  orderItems: Array<{
    sku: string
    quantity: number
    total: number
    totalCost: number
    order: Order
  }>
): Map<string, PLMetrics & { quantity: number; orders: number }> {
  const itemsBySKU = new Map<string, typeof orderItems>()

  // Group items by SKU
  orderItems.forEach(item => {
    const items = itemsBySKU.get(item.sku) || []
    items.push(item)
    itemsBySKU.set(item.sku, items)
  })

  // Calculate P&L for each SKU
  const plBySKU = new Map<string, PLMetrics & { quantity: number; orders: number }>()
  
  itemsBySKU.forEach((items, sku) => {
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
    const totalRevenue = items.reduce((sum, item) => sum + Number(item.total), 0)
    const totalCOGS = items.reduce((sum, item) => sum + Number(item.totalCost), 0)
    
    // Allocate transaction fees and ads costs proportionally
    const totalTransactionFees = items.reduce((sum, item) => {
      const orderRevenue = Number(item.order.total) - Number(item.order.refundAmount)
      const proportion = orderRevenue > 0 ? Number(item.total) / orderRevenue : 0
      return sum + (Number(item.order.transactionFee) * proportion)
    }, 0)

    const totalAdsCosts = items.reduce((sum, item) => {
      const orderRevenue = Number(item.order.total) - Number(item.order.refundAmount)
      const proportion = orderRevenue > 0 ? Number(item.total) / orderRevenue : 0
      return sum + (Number(item.order.allocatedAdsCost) * proportion)
    }, 0)

    const grossProfit = totalRevenue - totalCOGS
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0
    
    const netProfit = grossProfit - totalTransactionFees - totalAdsCosts
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0
    
    const roas = totalAdsCosts > 0 ? totalRevenue / totalAdsCosts : null

    const uniqueOrders = new Set(items.map(item => item.order.id)).size

    plBySKU.set(sku, {
      quantity: totalQuantity,
      orders: uniqueOrders,
      revenue: Math.round(totalRevenue * 100) / 100,
      cogs: Math.round(totalCOGS * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossMargin: Math.round(grossMargin * 100) / 100,
      transactionFees: Math.round(totalTransactionFees * 100) / 100,
      adsCosts: Math.round(totalAdsCosts * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
      roas: roas ? Math.round(roas * 100) / 100 : null,
    })
  })

  return plBySKU
}

/**
 * Get top performing products by net profit
 * 
 * @param plByProduct - P&L metrics by product
 * @param limit - Number of top products to return
 * @returns Array of top products sorted by net profit
 */
export function getTopProducts(
  plByProduct: Map<string, PLMetrics & { quantity: number; orders: number }>,
  limit: number = 10
): Array<{ sku: string; metrics: PLMetrics & { quantity: number; orders: number } }> {
  const products = Array.from(plByProduct.entries()).map(([sku, metrics]) => ({
    sku,
    metrics,
  }))

  return products
    .sort((a, b) => b.metrics.netProfit - a.metrics.netProfit)
    .slice(0, limit)
}
