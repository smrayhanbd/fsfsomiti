import { Prisma } from "@prisma/client"
import type { TransactionType } from "./types"

// Stable prefixes per transaction type — keeps voucher numbers human-readable
// while the Counter table provides atomicity.
const PREFIX_BY_TYPE: Record<TransactionType, string> = {
  DEPOSIT: "TR-DEP",
  WITHDRAWAL: "TR-WDR",
  CHARGE: "TR-CHG",
  INCOME_DISTRIBUTION: "TR-INC",
}

/**
 * Atomically allocate the next voucher number for a transaction type.
 *
 * The old `count+1` approach (lib/accounting.ts nextVoucherNo) raced under
 * concurrent inserts and could collide on the `@unique` constraint. This
 * version locks the shared "transaction" Counter row inside the caller's
 * transaction and increments it once.
 *
 * Must be called inside a `prisma.$transaction` callback.
 */
export async function nextTransactionNo(
  tx: Prisma.TransactionClient,
  type: TransactionType
): Promise<string> {
  // SELECT ... FOR UPDATE semantics: read-modify-write inside the tx keeps
  // concurrent approvers from handing out the same number.
  const counter = await tx.counter.upsert({
    where: { id: "transaction" },
    update: { value: { increment: 1 } },
    create: { id: "transaction", value: 1 },
  })
  const prefix = PREFIX_BY_TYPE[type] ?? "TR"
  return `${prefix}-${String(counter.value).padStart(6, "0")}`
}
