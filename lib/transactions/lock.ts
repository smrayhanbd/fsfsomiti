import { Prisma } from "@prisma/client"

/**
 * Concurrent-approval row locking helper (B11, B12, B13, B14, B19, B20).
 *
 * Problem: Prisma's `findUnique` does NOT issue `SELECT ... FOR UPDATE`, so
 * under PostgreSQL's default READ COMMITTED isolation level, two concurrent
 * transactions can both read PENDING_APPROVAL, both decide to approve, and
 * both succeed — double-spending the underlying account (B11), double-paying
 * a distribution share (B19), or posting a reversal against an already-reversed
 * transaction (B12).
 *
 * Fix: acquire a Postgres row lock at the START of the interactive
 * transaction. Other transactions that try to lock (or update) the same row
 * block until this one commits or rolls back — turning the race into a
 * serial sequence.
 *
 * MUST be called inside a `directPrisma.$transaction` callback. Using the
 * pooled `prisma` client here would not work because Supavisor reclaims the
 * connection mid-callback (see lib/prisma.ts).
 *
 * The returned row is the locked row (typed as any by default — callers
 * typically re-read via `findUnique` with relations). Returns null when no
 * row matches the id; the caller should throw a "not found" error in that
 * case before any further writes.
 *
 * Alternative considered: an optimistic-concurrency `version Int` column
 * with `updateMany({ where: { id, version }, data: { version: increment } })`.
 * That requires a schema migration (in another agent's scope), so we use the
 * pessimistic-lock approach here. When the version column lands, the schema
 * migration agent can switch each callsite to optimistic concurrency without
 * changing the public contract of this helper.
 */

// Strict allowlist of Prisma model → Postgres table names. Prisma quotes
// table names, so capitalisation must match the migration SQL exactly.
const ALLOWED_TABLES = new Set<string>([
  "Transaction",
  "Loan",
  "LoanRepayment",
  "JournalEntry",
  "IncomeDistribution",
  "Investment",
  "Election",
  "ElectionNomination",
  "ElectionParticipation",
])

/**
 * Acquire a Postgres `FOR UPDATE` row lock on `(table).id`.
 *
 * Throws if the table is not in the allowlist (defense-in-depth against SQL
 * injection — `table` is interpolated as an identifier and cannot be
 * parameterised in raw SQL).
 */
export async function lockRow<T = Record<string, unknown>>(
  tx: Prisma.TransactionClient,
  table: string,
  id: string
): Promise<T | null> {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(
      `lockRow: table "${table}" is not in the allowlist. Add it to lib/transactions/lock.ts before using.`
    )
  }
  // `id` is parameterised (safe); `table` is interpolated (validated above).
  const rows = await tx.$queryRaw<T[]>`
    SELECT * FROM ${Prisma.raw(`"${table}"`)} WHERE id = ${id} FOR UPDATE
  `
  return rows[0] ?? null
}

/**
 * Convenience wrapper that locks AND throws if the row is missing. Use this
 * when the caller expects the row to exist (the common case in approval /
 * reversal flows).
 */
export async function lockRowOrThrow<T = Record<string, unknown>>(
  tx: Prisma.TransactionClient,
  table: string,
  id: string,
  errorMessage = "Record not found."
): Promise<T> {
  const row = await lockRow<T>(tx, table, id)
  if (!row) throw new Error(errorMessage)
  return row
}
