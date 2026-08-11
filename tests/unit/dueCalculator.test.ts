import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Prisma } from "@prisma/client"
import { calculateDues, type DuePayment } from "@/lib/dueCalculator"

/**
 * Due calculator — exercises the per-cycle expected/fine/paid arithmetic.
 *
 * Construct FeeSetup objects matching the Prisma model shape. We use
 * `as Prisma.FeeSetupGetPayload<Record<string, never>>` to keep the test
 * type-safe without needing a real DB row.
 *
 * NOTE: `calculateDues` reads "now" via `new Date()` (NOT `Date.now()`), so
 * mocking `Date.now` directly has no effect. We use vitest's fake timers
 * (`vi.useFakeTimers` + `vi.setSystemTime`) which intercept the `Date`
 * constructor itself.
 */
type FeeSetup = Prisma.FeeSetupGetPayload<Record<string, never>>

function makeFeeSetup(overrides: Partial<FeeSetup>): FeeSetup {
  return {
    id: "test-" + Math.random().toString(36).slice(2),
    name: "Savings",
    amount: new Prisma.Decimal(100),
    effectiveDate: new Date("2026-01-01T00:00:00Z"),
    frequency: "MONTHLY",
    dueDay: 10,
    hasFine: false,
    fineAmount: null,
    boardApproved: true,
    createdAt: new Date(),
    targetType: "ALL",
    targetMemberIds: null,
    ...overrides,
  }
}

// Freeze "now" at 2026-03-15 for every test in this file. calculateDues
// only ever compares `new Date()` against effectiveDate / joinDate, so a
// single fixed system time is sufficient for every scenario below.
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-03-15T00:00:00Z"))
})

afterEach(() => {
  vi.useRealTimers()
})

describe("calculateDues — basic monthly case", () => {
  const memberId = "member-1"
  const joinDate = new Date("2026-01-01T00:00:00Z")

  it("computes 3 months of expected dues with no payments and no fines", () => {
    // Effective from Jan 1; "now" is March 15 — so 3 monthly cycles (Jan, Feb, Mar).
    const setup = makeFeeSetup({
      effectiveDate: new Date("2026-01-01T00:00:00Z"),
      amount: new Prisma.Decimal(100),
      frequency: "MONTHLY",
      dueDay: 10,
    })
    const payments: DuePayment[] = []

    const result = calculateDues(memberId, joinDate, [setup], payments)
    // 3 months × 100 = 300 expected; no payments; no fines.
    expect(result.totalExpected).toBe(300)
    expect(result.totalPaid).toBe(0)
    expect(result.totalFines).toBe(0)
    expect(result.totalDue).toBe(300)
  })

  it("subtracts deposits from totalDue", () => {
    const setup = makeFeeSetup({
      effectiveDate: new Date("2026-01-01T00:00:00Z"),
      amount: new Prisma.Decimal(100),
      frequency: "MONTHLY",
      dueDay: 10,
    })
    const payments: DuePayment[] = [
      { type: "DEPOSIT", amount: new Prisma.Decimal(150), date: new Date("2026-02-01T00:00:00Z") },
    ]

    const result = calculateDues(memberId, joinDate, [setup], payments)
    // 300 expected - 150 paid = 150 due
    expect(result.totalExpected).toBe(300)
    expect(result.totalPaid).toBe(150)
    expect(result.totalDue).toBe(150)
  })

  it("ignores WITHDRAWAL payments (they don't count as paid)", () => {
    const setup = makeFeeSetup({
      effectiveDate: new Date("2026-01-01T00:00:00Z"),
      amount: new Prisma.Decimal(100),
      frequency: "MONTHLY",
      dueDay: 10,
    })
    const payments: DuePayment[] = [
      { type: "WITHDRAWAL", amount: new Prisma.Decimal(500), date: new Date("2026-02-01T00:00:00Z") },
    ]

    const result = calculateDues(memberId, joinDate, [setup], payments)
    // 300 expected; WITHDRAWAL not counted as paid; 300 due
    expect(result.totalPaid).toBe(0)
    expect(result.totalDue).toBe(300)
  })

  it("clamps totalDue to zero (never negative)", () => {
    const setup = makeFeeSetup({
      effectiveDate: new Date("2026-01-01T00:00:00Z"),
      amount: new Prisma.Decimal(100),
      frequency: "MONTHLY",
      dueDay: 10,
    })
    // Overpaid by 100 — the calculator should not return -100.
    const payments: DuePayment[] = [
      { type: "DEPOSIT", amount: new Prisma.Decimal(400), date: new Date("2026-02-01T00:00:00Z") },
    ]

    const result = calculateDues(memberId, joinDate, [setup], payments)
    expect(result.totalDue).toBe(0)
  })
})

describe("calculateDues — fine handling", () => {
  const memberId = "member-2"
  const joinDate = new Date("2026-01-01T00:00:00Z")

  it("applies fines for past-due cycles when hasFine is true", () => {
    const setup = makeFeeSetup({
      effectiveDate: new Date("2026-01-01T00:00:00Z"),
      amount: new Prisma.Decimal(100),
      frequency: "MONTHLY",
      dueDay: 10,
      hasFine: true,
      fineAmount: new Prisma.Decimal(20),
    })
    const payments: DuePayment[] = []

    // "Now" is well past the Jan-10 due date → fine applies for Jan cycle.
    const result = calculateDues(memberId, joinDate, [setup], payments)
    // 3 months × 100 = 300 expected
    expect(result.totalExpected).toBe(300)
    // At least one fine should have been applied (Jan, possibly Feb too).
    expect(result.totalFines).toBeGreaterThan(0)
    // Each fine is 20, so the count should be divisible by 20.
    expect(result.totalFines % 20).toBe(0)
  })

  it("applies no fine when hasFine is false even if past due", () => {
    const setup = makeFeeSetup({
      effectiveDate: new Date("2026-01-01T00:00:00Z"),
      amount: new Prisma.Decimal(100),
      frequency: "MONTHLY",
      dueDay: 10,
      hasFine: false,
      fineAmount: null,
    })
    const payments: DuePayment[] = []

    const result = calculateDues(memberId, joinDate, [setup], payments)
    expect(result.totalFines).toBe(0)
  })
})

describe("calculateDues — target member scoping", () => {
  it("skips setups targeted at OTHER members (SPECIFIC)", () => {
    const memberId = "member-A"
    const joinDate = new Date("2026-01-01T00:00:00Z")
    const setup = makeFeeSetup({
      effectiveDate: new Date("2026-01-01T00:00:00Z"),
      amount: new Prisma.Decimal(100),
      frequency: "MONTHLY",
      dueDay: 10,
      targetType: "SPECIFIC",
      targetMemberIds: JSON.stringify(["member-B", "member-C"]),
    })
    const payments: DuePayment[] = []

    const result = calculateDues(memberId, joinDate, [setup], payments)
    // Setup doesn't apply → expected should be 0
    expect(result.totalExpected).toBe(0)
    expect(result.totalDue).toBe(0)
  })

  it("includes setups targeted at THIS member (SPECIFIC)", () => {
    const memberId = "member-A"
    const joinDate = new Date("2026-01-01T00:00:00Z")
    const setup = makeFeeSetup({
      effectiveDate: new Date("2026-01-01T00:00:00Z"),
      amount: new Prisma.Decimal(100),
      frequency: "MONTHLY",
      dueDay: 10,
      targetType: "SPECIFIC",
      targetMemberIds: JSON.stringify(["member-A", "member-C"]),
    })
    const payments: DuePayment[] = []

    const result = calculateDues(memberId, joinDate, [setup], payments)
    // Setup applies → 3 × 100 = 300
    expect(result.totalExpected).toBe(300)
  })
})
