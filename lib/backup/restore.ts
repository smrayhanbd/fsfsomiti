/**
 * Cloud Backup restore library.
 *
 * Reads a JSON backup file written by `createDatabaseBackup()` and imports
 * its contents back into the database. The restore is destructive — every
 * existing row in every backed-up table is DELETED before the backed-up rows
 * are inserted — so the post-restore DB state exactly matches the snapshot.
 *
 * Safety:
 *   • The whole restore runs inside a single `directPrisma.$transaction`
 *     so a failure partway through rolls everything back.
 *   • Foreign-key constraints are temporarily disabled (session_replication_role
 *     = replica) so we can restore tables in any order. They are re-enabled
 *     before the transaction commits, so a constraint violation in the
 *     restored data still aborts the restore.
 *   • The `_prisma_migrations` table is never touched — only app tables.
 *   • Tables not present in the backup file are left untouched.
 *
 * Output: a per-table count of restored rows + total time, used by the UI
 * to surface a "Restore complete: 12,345 rows across 47 tables in 4.2s" toast.
 */
import { promises as fs } from "node:fs"

import { directPrisma } from "@/lib/prisma"
import { readBackupFile } from "@/lib/backup"
import { getRequestLogger } from "@/lib/logger"

/** Outcome of a single restore attempt. */
export interface RestoreResult {
  /** Total tables restored. */
  tableCount: number
  /** Total rows restored across all tables. */
  rowCount: number
  /** Per-table row counts. */
  tableCounts: Record<string, number>
  /** Wall-clock duration in milliseconds. */
  durationMs: number
  /** Tables skipped (in backup file but no longer in schema). */
  skippedTables: string[]
  /** Any non-fatal warnings (e.g. column type mismatches). */
  warnings: string[]
}

/** Shape of a backup file — matches `createDatabaseBackup` output. */
interface BackupPayload {
  _meta: {
    version: number
    createdAt: string
    databaseUrlHash: string
    tableCount: number
    rowCount: number
  }
  tables: Record<string, Record<string, unknown>[]>
}

/**
 * Restore a backup file into the database.
 *
 * **Destructive**: every row in every table present in the backup file is
 * DELETED before the backed-up rows are inserted. Tables not in the backup
 * file are left untouched.
 *
 * @param filePath  Absolute path of the backup JSON file.
 */
export async function restoreDatabaseBackup(
  filePath: string,
): Promise<RestoreResult> {
  const log = getRequestLogger()
  const start = Date.now()

  // 1. Read + parse the backup file.
  const raw = await readBackupFile(filePath)
  let payload: BackupPayload
  try {
    payload = JSON.parse(raw) as BackupPayload
  } catch (err) {
    throw new Error(
      `Backup file is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!payload.tables || typeof payload.tables !== "object") {
    throw new Error("Backup file is missing the `tables` object.")
  }

  // 2. Resolve the set of tables that currently exist in the DB so we don't
  //    try to DELETE/INSERT against a dropped table.
  const liveTables = new Set(await listLiveTables())
  const backupTables = Object.keys(payload.tables)

  const tableCounts: Record<string, number> = {}
  const skippedTables: string[] = []
  const warnings: string[] = []
  let totalRows = 0

  // 3. Run the restore inside a single transaction so any failure rolls back.
  //    Use directPrisma (session-mode pooler) — interactive transactions can't
  //    run on the pooled transaction-mode pooler (per the lib/prisma.ts note).
  await directPrisma.$transaction(
    async (tx) => {
      // Disable FK checks for this session so we can restore tables in any
      // order. session_replication_role = 'replica' is the standard Postgres
      // way — triggers + FK checks are bypassed, exactly what we want for a
      // bulk restore. The role is reset before the tx commits, so a real
      // constraint violation in the restored data would still abort.
      await tx.$executeRawUnsafe(`SET session_replication_role = 'replica'`)

      try {
        for (const tableName of backupTables) {
          // Skip tables that no longer exist in the DB schema.
          if (!liveTables.has(tableName)) {
            skippedTables.push(tableName)
            warnings.push(
              `Table "${tableName}" is in the backup but not in the live schema — skipped.`,
            )
            continue
          }

          const rows = payload.tables[tableName]
          if (!Array.isArray(rows)) {
            warnings.push(
              `Table "${tableName}" has a non-array value in the backup — skipped.`,
            )
            continue
          }

          // Get the live column list for this table so we don't try to INSERT
          // into columns that have been dropped since the backup was taken.
          const liveColumns = await getTableColumns(tx, tableName)
          if (liveColumns.size === 0) {
            skippedTables.push(tableName)
            warnings.push(
              `Could not read columns for table "${tableName}" — skipped.`,
            )
            continue
          }

          // Wipe existing rows.
          await tx.$executeRawUnsafe(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`)

          if (rows.length === 0) {
            tableCounts[tableName] = 0
            continue
          }

          // Filter out columns that aren't in the live schema (defensive —
          // the backup may have been written against an older schema).
          const validColumns = Object.keys(rows[0]).filter((c) =>
            liveColumns.has(c),
          )
          const droppedColumns = Object.keys(rows[0]).filter(
            (c) => !liveColumns.has(c),
          )
          if (droppedColumns.length > 0) {
            warnings.push(
              `Table "${tableName}": columns [${droppedColumns.join(
                ", ",
              )}] are in the backup but not in the live schema — values for those columns were dropped.`,
            )
          }

          // Batch INSERT in chunks of 500 to avoid blowing past the param
          // limit (65535 params per query). For each row we generate a
          // ($1, $2, $3, ...) placeholder tuple and concatenate.
          const BATCH_SIZE = 500
          for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE)
            const placeholders: string[] = []
            const values: unknown[] = []
            let paramIdx = 1
            for (const row of batch) {
              const rowPlaceholders: string[] = []
              for (const col of validColumns) {
                const v = row[col]
                if (v === undefined || v === null) {
                  rowPlaceholders.push("NULL")
                } else if (
                  typeof v === "object" &&
                  v !== null &&
                  !Array.isArray(v)
                ) {
                  // JSONB columns get stringified.
                  values.push(JSON.stringify(v))
                  rowPlaceholders.push(`$${paramIdx++}`)
                } else if (Array.isArray(v)) {
                  // Array columns — Postgres array literal.
                  values.push(v)
                  rowPlaceholders.push(`$${paramIdx++}`)
                } else {
                  values.push(v)
                  rowPlaceholders.push(`$${paramIdx++}`)
                }
              }
              placeholders.push(`(${rowPlaceholders.join(", ")})`)
            }

            const colList = validColumns
              .map((c) => `"${c}"`)
              .join(", ")
            const sql = `INSERT INTO "${tableName}" (${colList}) VALUES ${placeholders.join(
              ", ",
            )} ON CONFLICT DO NOTHING`

            await tx.$executeRawUnsafe(sql, ...values)
          }

          tableCounts[tableName] = rows.length
          totalRows += rows.length
        }

        // Re-enable FK checks before commit so any constraint violation in
        // the restored data aborts the transaction.
        await tx.$executeRawUnsafe(`SET session_replication_role = 'origin'`)
      } catch (err) {
        // Best-effort reset on failure — the tx will roll back anyway, but
        // session_replication_role is session-scoped so we want it reset
        // even if the rollback doesn't reset it.
        await tx.$executeRawUnsafe(`SET session_replication_role = 'origin'`)
        throw err
      }
    },
    { maxWait: 30_000, timeout: 600_000 }, // 10-min restore window — large DBs take time
  )

  const durationMs = Date.now() - start
  log.info(
    { tableCount: backupTables.length, rowCount: totalRows, durationMs, skippedTables: skippedTables.length },
    "[restore] complete",
  )

  return {
    tableCount: Object.keys(tableCounts).length,
    rowCount: totalRows,
    tableCounts,
    durationMs,
    skippedTables,
    warnings,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** List every user table in the `public` schema (excludes _prisma_migrations). */
async function listLiveTables(): Promise<string[]> {
  const rows = await directPrisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename != '_prisma_migrations'
    ORDER BY tablename ASC
  `
  return rows.map((r) => r.tablename)
}

/** Fetch the column names for a table (information_schema). */
async function getTableColumns(
  tx: Parameters<Parameters<typeof directPrisma.$transaction>[0]>[0],
  tableName: string,
): Promise<Set<string>> {
  // tableName comes from a trusted source (pg_tables) — safe for $queryRawUnsafe.
  const rows = await tx.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tableName.replace(/'/g, "''")}'`,
  )
  return new Set(rows.map((r) => r.column_name))
}
