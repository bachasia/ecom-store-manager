/**
 * Transaction Fee Calculation
 * 
 * Calculates payment gateway transaction fees based on order total
 * Formula: (orderTotal × feePercentage / 100) + feeFixed
 */

interface PaymentGateway {
  id: string
  name: string
  displayName: string
  feePercentage: number
  feeFixed: number
  isActive: boolean
}

/**
 * Calculate transaction fee for an order
 * @param orderTotal - Total order amount
 * @param gateway - Payment gateway configuration
 * @returns Calculated transaction fee
 */
export function calculateTransactionFee(
  orderTotal: number,
  gateway: PaymentGateway | null
): number {
  // No gateway or inactive gateway = no fee
  if (!gateway || !gateway.isActive) {
    return 0
  }

  // Validate inputs
  if (orderTotal < 0) {
    throw new Error("Order total cannot be negative")
  }

  // Calculate percentage fee
  const percentageFee = (orderTotal * Number(gateway.feePercentage)) / 100

  // Add fixed fee
  const totalFee = percentageFee + Number(gateway.feeFixed)

  // Round to 2 decimal places
  return Math.round(totalFee * 100) / 100
}

/**
 * Calculate transaction fee from gateway configuration values
 * @param orderTotal - Total order amount
 * @param feePercentage - Gateway fee percentage (e.g., 2.9 for 2.9%)
 * @param feeFixed - Gateway fixed fee (e.g., 0.30)
 * @returns Calculated transaction fee
 */
export function calculateTransactionFeeFromValues(
  orderTotal: number,
  feePercentage: number,
  feeFixed: number
): number {
  // Validate inputs
  if (orderTotal < 0) {
    throw new Error("Order total cannot be negative")
  }

  if (feePercentage < 0 || feeFixed < 0) {
    throw new Error("Fee values cannot be negative")
  }

  // Calculate percentage fee
  const percentageFee = (orderTotal * feePercentage) / 100

  // Add fixed fee
  const totalFee = percentageFee + feeFixed

  // Round to 2 decimal places
  return Math.round(totalFee * 100) / 100
}

/**
 * Get example transaction fee for display purposes
 * @param gateway - Payment gateway configuration
 * @param exampleAmount - Example order amount (default: 100)
 * @returns Example fee calculation
 */
export function getExampleTransactionFee(
  gateway: PaymentGateway,
  exampleAmount: number = 100
): {
  amount: number
  percentageFee: number
  fixedFee: number
  totalFee: number
  effectiveRate: number
} {
  const percentageFee = (exampleAmount * Number(gateway.feePercentage)) / 100
  const fixedFee = Number(gateway.feeFixed)
  const totalFee = calculateTransactionFee(exampleAmount, gateway)
  const effectiveRate = (totalFee / exampleAmount) * 100

  return {
    amount: exampleAmount,
    percentageFee: Math.round(percentageFee * 100) / 100,
    fixedFee,
    totalFee,
    effectiveRate: Math.round(effectiveRate * 100) / 100,
  }
}
