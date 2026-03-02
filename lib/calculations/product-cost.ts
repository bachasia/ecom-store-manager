import { prisma } from "@/lib/prisma"

/**
 * Build a lookup map: productId → sorted cost history (ascending effectiveDate)
 * Used during recalculate to efficiently find the right COGS for each order date.
 */
export async function buildCostHistoryMap(
  productIds: string[]
): Promise<Map<string, Array<{ cost: number; effectiveDate: Date }>>> {
  if (productIds.length === 0) return new Map()

  const history = await prisma.productCostHistory.findMany({
    where: { productId: { in: productIds } },
    select: { productId: true, cost: true, effectiveDate: true },
    orderBy: { effectiveDate: "asc" },
  })

  const map = new Map<string, Array<{ cost: number; effectiveDate: Date }>>()
  for (const row of history) {
    const list = map.get(row.productId) ?? []
    list.push({ cost: Number(row.cost), effectiveDate: row.effectiveDate })
    map.set(row.productId, list)
  }
  return map
}

/**
 * Resolve the effective COGS for a product on a given order date.
 * Picks the most recent history entry where effectiveDate <= orderDate.
 * Falls back to baseCost if no history applies.
 */
export function resolveUnitCost(
  orderDate: Date,
  history: Array<{ cost: number; effectiveDate: Date }> | undefined,
  baseCost: number
): number {
  if (!history || history.length === 0) return baseCost

  let resolved = baseCost
  for (const entry of history) {
    if (entry.effectiveDate <= orderDate) {
      resolved = entry.cost
    } else {
      break // list is sorted ascending — no need to go further
    }
  }
  return resolved
}
