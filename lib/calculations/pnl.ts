/**
 * P&L (Profit & Loss) Calculation Engine
 * 
 * Calculates profit metrics for orders and aggregated data
 * 
 * Revenue definitions:
 *   GMV          = Σ order.total  (giá trị bán ra, không trừ refund)
 *   customerRefund = Σ refundAmount  (tiền hoàn lại cho khách)
 *   revenue (Net Revenue) = GMV - customerRefund
 *   vendorRefund   = Σ vendorRefundAmount  (NCC hoàn lại → giảm chi phí, tăng profit)
 *
 * P&L formula:
 *   Net Revenue   = GMV - customerRefund
 *   Net COGS      = totalCOGS - vendorRefund
 *   Gross Profit  = Net Revenue - Net COGS
 *   Net Profit    = Gross Profit - transactionFees - adsCosts
 *   Profit Margin = Net Profit / Net Revenue × 100
 *   ROAS          = Net Revenue / adsCosts
 */

import { utcToLocalYMD } from "@/lib/utils/timezone"

interface Order {
  id: string
  total: number
  refundAmount: number
  vendorRefundAmount: number
  totalCOGS: number
  transactionFee: number
  allocatedAdsCost: number
}

interface PLMetrics {
  gmv: number             // Gross Merchandise Value = Σ order.total
  customerRefund: number  // Tiền hoàn lại cho khách
  vendorRefund: number    // NCC hoàn lại (giảm chi phí)
  revenue: number         // Net Revenue = gmv - customerRefund (backward compat key)
  cogs: number            // Gross COGS (trước khi trừ vendor refund)
  grossProfit: number     // Net Revenue - (COGS - vendorRefund)
  grossMargin: number
  transactionFees: number
  adsCosts: number
  netProfit: number
  profitMargin: number
  roas: number | null
}

/**
 * Calculate P&L metrics for a single order
 */
export function calculateOrderPL(order: Order): {
  grossProfit: number
  netProfit: number
  profitMargin: number
} {
  // Net Revenue = Total - Customer Refund
  const revenue = Number(order.total) - Number(order.refundAmount)
  
  // Net COGS = COGS - Vendor Refund (vendor refund reduces cost)
  const netCOGS = Number(order.totalCOGS) - Number(order.vendorRefundAmount)
  
  // Gross Profit = Net Revenue - Net COGS
  const grossProfit = revenue - netCOGS
  
  // Net Profit = Gross Profit - Transaction Fee - Ads Cost
  const netProfit = grossProfit - Number(order.transactionFee) - Number(order.allocatedAdsCost)
  
  // Profit Margin = (Net Profit / Net Revenue) × 100
  const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0
  
  return {
    grossProfit: Math.round(grossProfit * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    profitMargin: Math.round(profitMargin * 100) / 100,
  }
}

/**
 * Calculate aggregated P&L metrics for multiple orders
 */
export function calculateAggregatePL(orders: Order[]): PLMetrics {
  if (orders.length === 0) {
    return {
      gmv: 0,
      customerRefund: 0,
      vendorRefund: 0,
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

  // GMV = sum of order totals (before customer refund)
  const gmv = orders.reduce((sum, order) => sum + Number(order.total), 0)

  // Customer refund
  const totalCustomerRefund = orders.reduce((sum, order) => sum + Number(order.refundAmount), 0)

  // Net Revenue
  const totalRevenue = gmv - totalCustomerRefund

  // Vendor refund (reduces COGS)
  const totalVendorRefund = orders.reduce((sum, order) => sum + Number(order.vendorRefundAmount), 0)

  // Gross COGS (before vendor refund)
  const totalCOGS = orders.reduce((sum, order) => sum + Number(order.totalCOGS), 0)

  // Net COGS = COGS - Vendor Refund
  const netCOGS = totalCOGS - totalVendorRefund

  const totalTransactionFees = orders.reduce((sum, order) => sum + Number(order.transactionFee), 0)
  const totalAdsCosts = orders.reduce((sum, order) => sum + Number(order.allocatedAdsCost), 0)

  // Gross Profit = Net Revenue - Net COGS
  const grossProfit = totalRevenue - netCOGS
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0
  
  const netProfit = grossProfit - totalTransactionFees - totalAdsCosts
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0
  
  const roas = totalAdsCosts > 0 ? totalRevenue / totalAdsCosts : null

  return {
    gmv: Math.round(gmv * 100) / 100,
    customerRefund: Math.round(totalCustomerRefund * 100) / 100,
    vendorRefund: Math.round(totalVendorRefund * 100) / 100,
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
 */
export function calculatePLByDate(
  orders: (Order & { orderDate: Date })[],
  timezone: string = "UTC"
): Map<string, PLMetrics> {
  const ordersByDate = new Map<string, (Order & { orderDate: Date })[]>()

  orders.forEach(order => {
    const dateKey = utcToLocalYMD(order.orderDate, timezone)
    const ordersForDate = ordersByDate.get(dateKey) || []
    ordersForDate.push(order)
    ordersByDate.set(dateKey, ordersForDate)
  })

  const plByDate = new Map<string, PLMetrics>()
  ordersByDate.forEach((ordersForDate, dateKey) => {
    plByDate.set(dateKey, calculateAggregatePL(ordersForDate))
  })

  return plByDate
}

/**
 * Calculate P&L metrics by month
 */
export function calculatePLByMonth(
  orders: (Order & { orderDate: Date })[],
  timezone: string = "UTC"
): Map<string, PLMetrics> {
  const ordersByMonth = new Map<string, (Order & { orderDate: Date })[]>()

  orders.forEach(order => {
    const monthKey = utcToLocalYMD(order.orderDate, timezone).substring(0, 7)
    const ordersForMonth = ordersByMonth.get(monthKey) || []
    ordersForMonth.push(order)
    ordersByMonth.set(monthKey, ordersForMonth)
  })

  const plByMonth = new Map<string, PLMetrics>()
  ordersByMonth.forEach((ordersForMonth, monthKey) => {
    plByMonth.set(monthKey, calculateAggregatePL(ordersForMonth))
  })

  return plByMonth
}

/**
 * Calculate P&L metrics by product SKU
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

  orderItems.forEach(item => {
    const items = itemsBySKU.get(item.sku) || []
    items.push(item)
    itemsBySKU.set(item.sku, items)
  })

  const plBySKU = new Map<string, PLMetrics & { quantity: number; orders: number }>()
  
  itemsBySKU.forEach((items, sku) => {
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
    const gmv = items.reduce((sum, item) => sum + Number(item.total), 0)
    const totalCOGS = items.reduce((sum, item) => sum + Number(item.totalCost), 0)
    
    // Allocate transaction fees, ads costs, and vendor refund proportionally
    let totalTransactionFees = 0
    let totalAdsCosts = 0
    let totalVendorRefund = 0
    let totalCustomerRefund = 0

    items.forEach(item => {
      const orderGMV = Number(item.order.total)
      const orderRevenue = orderGMV - Number(item.order.refundAmount)
      const proportion = orderGMV > 0
        ? Math.min(Number(item.total) / orderGMV, 1) * (orderRevenue > 0 ? orderRevenue / orderGMV : 0)
        : 0
      totalTransactionFees += Number(item.order.transactionFee) * proportion
      totalAdsCosts += Number(item.order.allocatedAdsCost) * proportion
      totalVendorRefund += Number(item.order.vendorRefundAmount) * proportion
      totalCustomerRefund += Number(item.order.refundAmount) * proportion
    })

    const revenue = gmv - totalCustomerRefund
    const netCOGS = totalCOGS - totalVendorRefund
    const grossProfit = revenue - netCOGS
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
    
    const netProfit = grossProfit - totalTransactionFees - totalAdsCosts
    const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0
    
    const roas = totalAdsCosts > 0 ? revenue / totalAdsCosts : null
    const uniqueOrders = new Set(items.map(item => item.order.id)).size

    plBySKU.set(sku, {
      quantity: totalQuantity,
      orders: uniqueOrders,
      gmv: Math.round(gmv * 100) / 100,
      customerRefund: Math.round(totalCustomerRefund * 100) / 100,
      vendorRefund: Math.round(totalVendorRefund * 100) / 100,
      revenue: Math.round(revenue * 100) / 100,
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
