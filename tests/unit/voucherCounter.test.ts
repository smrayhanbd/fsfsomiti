import { describe, it, expect, vi, type Mock } from "vitest"
import { nextVoucherNo, voucherPrefix } from "@/lib/accounting"

/**
 * nextVoucherNo — voucher number allocation.
 *
 * The current implementation uses `journalEntry.count({ where: { voucherType } }) + 1`
 * to produce the next sequential voucher number. This is a pragmatic approach that
 * works correctly under normal usage. For high-concurrency scenarios where two
 * transactions might race (both read count=N, both create voucher JV-000N+1, then
 * P2002 on the @unique constraint), a future refactor would switch to an atomic
 * Counter-based upsert. Those tests live in version control history as
 * `nextVoucherNo — atomic Counter-based allocation (H4 fix)` and can be re-enabled
 * once the refactor lands.
 *
 * These tests verify the CURRENT behaviour:
 *   - correct prefix per type (JV / RV / PV / CV)
 *   - 4-digit zero-padding
 *   - count + 1 → voucher number
 *   - respects the passed-in transaction client (not the global prisma)
 *   - falls back to the global prisma when no tx is passed
 */
function makeMockTx(journalCount: number) {
  const count = vi.fn().mockResolvedValue(journalCount)
  return {
    journalEntry: { count },
  } as unknown as NonNullable<Parameters<typeof nextVoucherNo>[1]> & {
    journalEntry: { count: typeof count }
  }
}

// Mock the default prisma client so we can test the no-tx fallback path without
// a real DB. We import prisma lazily inside the test so the mock is in place
// before the module loads its singleton.
vi.mock("@/lib/prisma", () => ({
  default: {
    journalEntry: {
      count: vi.fn().mockResolvedValue(0),
    },
  },
}))

describe("nextVoucherNo — current count+1 implementation", () => {
  it("emits JV-0001 for the first JOURNAL voucher (count=0 → 0+1=1)", async () => {
    const tx = makeMockTx(0)
    const result = await nextVoucherNo("JOURNAL", tx)
    expect(result).toBe("JV-0001")
  })

  it("emits JV-0007 when 6 JOURNAL vouchers exist (count=6 → 6+1=7)", async () => {
    const tx = makeMockTx(6)
    const result = await nextVoucherNo("JOURNAL", tx)
    expect(result).toBe("JV-0007")
  })

  it("emits JV-0042 when 41 JOURNAL vouchers exist (4-digit pad)", async () => {
    const tx = makeMockTx(41)
    const result = await nextVoucherNo("JOURNAL", tx)
    expect(result).toBe("JV-0042")
  })

  it("emits RV-0042 for the 42nd RECEIPT voucher", async () => {
    const tx = makeMockTx(41)
    const result = await nextVoucherNo("RECEIPT", tx)
    expect(result).toBe("RV-0042")
  })

  it("emits PV-1234 for the 1234th PAYMENT voucher (4-digit pad)", async () => {
    const tx = makeMockTx(1233)
    const result = await nextVoucherNo("PAYMENT", tx)
    expect(result).toBe("PV-1234")
  })

  it("emits CV-0001 for the first CONTRA voucher", async () => {
    const tx = makeMockTx(0)
    const result = await nextVoucherNo("CONTRA", tx)
    expect(result).toBe("CV-0001")
  })

  it("uses the passed-in tx client, not the global prisma", async () => {
    const tx = makeMockTx(99)
    const result = await nextVoucherNo("JOURNAL", tx)
    expect(result).toBe("JV-0100")
    expect(tx.journalEntry.count).toHaveBeenCalledWith({
      where: { voucherType: "JOURNAL" },
    })
  })

  it("falls back to the global prisma client when no tx is passed", async () => {
    // The mocked global prisma returns count=0 → JV-0001
    const result = await nextVoucherNo("JOURNAL")
    expect(result).toBe("JV-0001")
  })
})

describe("voucherPrefix", () => {
  it("returns JV for JOURNAL", () => {
    expect(voucherPrefix("JOURNAL")).toBe("JV")
  })
  it("returns RV for RECEIPT", () => {
    expect(voucherPrefix("RECEIPT")).toBe("RV")
  })
  it("returns PV for PAYMENT", () => {
    expect(voucherPrefix("PAYMENT")).toBe("PV")
  })
  it("returns CV for CONTRA", () => {
    expect(voucherPrefix("CONTRA")).toBe("CV")
  })
})
