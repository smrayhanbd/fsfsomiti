import { describe, it, expect } from "vitest"
import {
  generateSchedule,
  round2,
  addInterval,
  PERIODS_PER_YEAR,
} from "@/lib/loanSchedule"

/**
 * Loan schedule engine — pure-function unit tests.
 *
 * We exercise the public `generateSchedule` entry-point (which dispatches to
 * `generateReducingSchedule` when `interestType: "REDUCING"` — the spec
 * mentioned the internal helper but it isn't exported; the public API is the
 * right test surface anyway).
 *
 * Reference math:
 *   EMI = P · r · (1+r)ⁿ / ((1+r)ⁿ − 1)
 *   where r = annualRate / 100 / periodsPerYear
 *
 * The canonical example we use: 100,000 principal, 12% annual, monthly
 * instalments over 12 months ⇒ EMI ≈ 8,884.88, total interest ≈ 6,618.62.
 * These are the same numbers any loan calculator will return; cross-checked
 * against https://www.calculator.net/loan-calculator.html.
 */
describe("generateSchedule (reducing balance)", () => {
  const baseInput = {
    principal: 100_000,
    annualRate: 12,
    interestType: "REDUCING" as const,
    repaymentFreq: "MONTHLY" as const,
    numberOfInstallments: 12,
    disburseDate: new Date("2026-01-01T00:00:00Z"),
  }

  it("computes the standard amortization EMI", () => {
    const sched = generateSchedule(baseInput)
    // EMI for 100k @ 12% / 12 months ≈ 8,884.88
    expect(sched.installmentAmount).toBeCloseTo(8884.88, 1)
    expect(sched.totalPrincipal).toBe(100_000)
    // Total interest = sum of per-row interest ≈ 6,618.62
    expect(sched.totalInterest).toBeCloseTo(6618.62, 0)
    // Total payable = principal + interest
    expect(sched.totalPayable).toBeCloseTo(106_618.62, 0)
  })

  it("generates exactly N rows", () => {
    const sched = generateSchedule(baseInput)
    expect(sched.rows).toHaveLength(12)
    // Each row has a sequential instalmentNo 1..N
    expect(sched.rows.map((r) => r.installmentNo)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ])
  })

  it("clears the balance to zero after the last instalment", () => {
    const sched = generateSchedule(baseInput)
    const last = sched.rows[sched.rows.length - 1]
    expect(last.balanceAfter).toBe(0)
    expect(last.principal + last.interest).toBeCloseTo(last.installmentAmount, 2)
  })

  it("charges less interest on each subsequent instalment (reducing balance)", () => {
    const sched = generateSchedule(baseInput)
    // Interest decreases monotonically as principal is paid down.
    for (let i = 1; i < sched.rows.length; i++) {
      expect(sched.rows[i].interest).toBeLessThanOrEqual(sched.rows[i - 1].interest)
    }
  })

  it("returns installmentAmount = principal / N when rate is 0", () => {
    const sched = generateSchedule({ ...baseInput, annualRate: 0 })
    expect(sched.installmentAmount).toBeCloseTo(round2(100_000 / 12), 2)
    expect(sched.totalInterest).toBe(0)
    expect(sched.totalPayable).toBe(100_000)
  })

  it("handles weekly frequency with correct period count", () => {
    const sched = generateSchedule({
      ...baseInput,
      repaymentFreq: "WEEKLY",
      numberOfInstallments: 52,
    })
    expect(sched.rows).toHaveLength(52)
    // 52 weeks of interest at 12%/52 per week is much less than 12 months at 12%/12.
    // Just sanity-check the schedule sums to the principal.
    const totalPrincipal = sched.rows.reduce((s, r) => s + r.principal, 0)
    expect(totalPrincipal).toBeCloseTo(100_000, 0)
  })

  it("treats numberOfInstallments < 1 as 1 (defensive)", () => {
    const sched = generateSchedule({ ...baseInput, numberOfInstallments: 0 })
    expect(sched.rows).toHaveLength(1)
  })
})

describe("round2", () => {
  it("rounds to 2 decimal places using banker's-safe rounding", () => {
    expect(round2(1.005)).toBe(1.01) // classic float-rounding edge case
    expect(round2(2.675)).toBe(2.68)
    expect(round2(0.1 + 0.2)).toBe(0.3) // IEEE-754 drift compensation
  })
})

describe("addInterval", () => {
  it("adds months clamping the day to month length", () => {
    const jan31 = new Date("2026-01-31T00:00:00Z")
    const feb = addInterval(jan31, "MONTHLY", 1)
    // Jan 31 + 1 month should clamp to Feb 28 (2026 is not a leap year)
    expect(feb.getMonth()).toBe(1) // February
    expect(feb.getDate()).toBe(28)
  })

  it("respects QUARTERLY as 3 months", () => {
    const jan1 = new Date("2026-01-01T00:00:00Z")
    const apr1 = addInterval(jan1, "QUARTERLY", 1)
    expect(apr1.getMonth()).toBe(3) // April (0-indexed)
  })
})

describe("PERIODS_PER_YEAR", () => {
  it("matches the documented annualisation factors", () => {
    expect(PERIODS_PER_YEAR.MONTHLY).toBe(12)
    expect(PERIODS_PER_YEAR.WEEKLY).toBe(52)
    expect(PERIODS_PER_YEAR.QUARTERLY).toBe(4)
    expect(PERIODS_PER_YEAR.YEARLY).toBe(1)
    expect(PERIODS_PER_YEAR.DAILY).toBe(365)
  })
})
