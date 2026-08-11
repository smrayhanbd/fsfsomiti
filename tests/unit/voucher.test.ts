import { describe, it, expect, vi, type Mock } from "vitest"
import { nextTransactionNo } from "@/lib/transactions/voucher"
import type { TransactionType } from "@/lib/transactions/types"

/**
 * Voucher number allocation — `nextTransactionNo`.
 *
 * The function does an atomic `tx.counter.upsert({ where: { id: "transaction" },
 * update: { value: { increment: 1 } }, create: { id: "transaction", value: 1 } })`
 * inside the caller's transaction and returns the prefixed voucher number.
 *
 * We mock the Prisma transaction client so we can test the prefix + zero-pad
 * logic in isolation. The real DB race-condition behaviour is covered by the
 * integration tests (the unit tests can't catch a real race anyway).
 */
function makeMockTx(counterValue: number) {
  const upsert = vi.fn().mockResolvedValue({
    id: "transaction",
    value: counterValue,
  })
  return {
    counter: { upsert },
    // The shape Prisma expects: Prisma.TransactionClient. We cast loosely
    // because we only stub the methods `nextTransactionNo` actually calls.
  } as unknown as Parameters<typeof nextTransactionNo>[0]
}

describe("nextTransactionNo — prefix + zero-pad", () => {
  it("emits TR-DEP-000001 for the first DEPOSIT voucher", async () => {
    const tx = makeMockTx(1)
    const result = await nextTransactionNo(tx, "DEPOSIT" as TransactionType)
    expect(result).toBe("TR-DEP-000001")
    expect(tx.counter.upsert).toHaveBeenCalledWith({
      where: { id: "transaction" },
      update: { value: { increment: 1 } },
      create: { id: "transaction", value: 1 },
    })
  })

  it("emits TR-WDR-000042 for the 42nd WITHDRAWAL voucher", async () => {
    const tx = makeMockTx(42)
    const result = await nextTransactionNo(tx, "WITHDRAWAL" as TransactionType)
    expect(result).toBe("TR-WDR-000042")
  })

  it("emits TR-CHG-001234 for the 1234th CHARGE voucher (6-digit pad)", async () => {
    const tx = makeMockTx(1234)
    const result = await nextTransactionNo(tx, "CHARGE" as TransactionType)
    expect(result).toBe("TR-CHG-001234")
  })

  it("emits TR-INC-1234567 for a 7-digit counter (no truncation)", async () => {
    const tx = makeMockTx(1_234_567)
    const result = await nextTransactionNo(
      tx,
      "INCOME_DISTRIBUTION" as TransactionType,
    )
    // padStart(6, "0") is a no-op when the number is already >= 6 digits.
    expect(result).toBe("TR-INC-1234567")
  })

  it("falls back to the bare TR prefix for an unknown type", async () => {
    const tx = makeMockTx(7)
    // Cast: TS prevents passing invalid TransactionType literals, but the
    // runtime guard (`PREFIX_BY_TYPE[type] ?? "TR"`) should still hold.
    const result = await nextTransactionNo(
      tx,
      "UNKNOWN" as unknown as TransactionType,
    )
    expect(result).toBe("TR-000007")
  })
})

describe("nextTransactionNo — upsert atomicity", () => {
  it("uses a stable counter id ('transaction') on every call", async () => {
    const tx = makeMockTx(5)
    await nextTransactionNo(tx, "DEPOSIT" as TransactionType)
    const call = (tx.counter.upsert as unknown as Mock).mock.calls[0]?.[0] as
      | { where: { id: string } }
      | undefined
    expect(call?.where?.id).toBe("transaction")
  })

  it("creates the counter row on first call (value=1)", async () => {
    const tx = makeMockTx(1)
    await nextTransactionNo(tx, "DEPOSIT" as TransactionType)
    const call = (tx.counter.upsert as unknown as Mock).mock.calls[0]?.[0] as
      | { create: { id: string; value: number } }
      | undefined
    expect(call?.create).toEqual({ id: "transaction", value: 1 })
  })

  it("increments the counter by exactly 1 on every call", async () => {
    const tx = makeMockTx(99)
    await nextTransactionNo(tx, "DEPOSIT" as TransactionType)
    const call = (tx.counter.upsert as unknown as Mock).mock.calls[0]?.[0] as
      | { update: { value: { increment: number } } }
      | undefined
    expect(call?.update?.value).toEqual({ increment: 1 })
  })
})
