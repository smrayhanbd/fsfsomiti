// Atomic monotonic ID generators for the Investment & Project modules.
// Uses the Counter model inside a locked `prisma.$transaction` — the same
// race-safe pattern the Transactions module uses for voucher numbers.
//
//   INV-2026-001   PRJ-2026-001

import { Prisma } from "@prisma/client"

/**
 * Atomically increment a year-scoped counter and return the formatted id.
 * `counterKey` is like "investment-2026" so each year gets its own sequence.
 */
export async function nextYearScopedId(
  tx: Prisma.TransactionClient,
  counterKey: string,
  prefix: string,
  year: number
): Promise<string> {
  // Lock the counter row for update inside the interactive transaction so
  // concurrent creates can't collide on the same number.
  const row = await tx.counter.upsert({
    where: { id: counterKey },
    update: { value: { increment: 1 } },
    create: { id: counterKey, value: 1 },
  })
  return `${prefix}-${year}-${String(row.value).padStart(3, "0")}`
}

/** Next investment number, e.g. INV-2026-001. */
export function nextInvestmentNo(tx: Prisma.TransactionClient, date: Date = new Date()): Promise<string> {
  const year = date.getFullYear()
  return nextYearScopedId(tx, `investment-${year}`, "INV", year)
}

/** Next project number, e.g. PRJ-2026-001. */
export function nextProjectNo(tx: Prisma.TransactionClient, date: Date = new Date()): Promise<string> {
  const year = date.getFullYear()
  return nextYearScopedId(tx, `project-${year}`, "PRJ", year)
}
