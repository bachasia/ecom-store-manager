import test from "node:test"
import assert from "node:assert/strict"

import {
  getAlertCount,
  getCurrentMonthToDateRange,
  getPresetRange,
  toYMD,
} from "@/lib/reports/helpers"

test("toYMD formats date as YYYY-MM-DD", () => {
  assert.equal(toYMD(new Date(2026, 1, 27)), "2026-02-27")
})

test("getPresetRange returns month-to-date range", () => {
  const range = getPresetRange("mtd", new Date(2026, 1, 27))
  assert.deepEqual(range, {
    startDate: "2026-02-01",
    endDate: "2026-02-27",
  })
})

test("getPresetRange returns last month range across year boundary", () => {
  const range = getPresetRange("lastMonth", new Date(2026, 0, 12))
  assert.deepEqual(range, {
    startDate: "2025-12-01",
    endDate: "2025-12-31",
  })
})

test("getPresetRange returns last year range", () => {
  const range = getPresetRange("lastYear", new Date(2026, 6, 4))
  assert.deepEqual(range, {
    startDate: "2025-01-01",
    endDate: "2025-12-31",
  })
})

test("getAlertCount sums all alert buckets", () => {
  assert.equal(
    getAlertCount({
      negativeROIDays: 2,
      lowROASDays: 3,
      missingCOGSCount: 4,
    }),
    9
  )
})

test("getAlertCount handles missing summary values", () => {
  assert.equal(getAlertCount(undefined), 0)
  assert.equal(getAlertCount({ lowROASDays: 2 }), 2)
})

test("getCurrentMonthToDateRange builds MTD dates", () => {
  assert.deepEqual(getCurrentMonthToDateRange(new Date(2026, 1, 7)), {
    startDate: "2026-02-01",
    endDate: "2026-02-07",
  })
})
