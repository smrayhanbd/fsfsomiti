"use server"

/**
 * Cloud Backup server actions.
 *
 *   createBackup()       — dump the entire DB to a JSON file + persist metadata
 *   listBackups()        — return every Backup row (newest first)
 *   deleteBackup(id)     — delete a Backup row + its file
 *   getBackupById(id)    — return a single Backup row (used by the download route)
 *   getBackupStats()     — return live DB row counts for the pre-backup summary
 *
 * All actions require a signed-in SUPER_ADMIN. The Cloud Backup page is the
 * only entry-point that ever calls these, so the auth check is duplicated
 * here (defense in depth) and in the page server component.
 */
import { revalidatePath } from "next/cache"

import prisma from "@/lib/prisma"
import { getCurrentUser, isSuperAdmin } from "@/lib/permissions"
import {
  createDatabaseBackup,
  deleteBackupFile,
  getDatabaseStats,
  type TableCountEntry,
} from "@/lib/backup"
import { restoreDatabaseBackup, type RestoreResult } from "@/lib/backup/restore"

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Reject any caller who is not a signed-in SUPER_ADMIN. */
async function requireSuperAdmin() {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be signed in to manage backups.")
  if (!isSuperAdmin(user)) {
    throw new Error("Only the Super Admin can manage backups.")
  }
  return user
}

// ─── Public actions ──────────────────────────────────────────────────────

/**
 * Trigger a new database backup. The Backup row is created up-front in
 * PENDING status so the UI can render progress even before the dump
 * finishes; it transitions to IN_PROGRESS → SUCCESS / FAILED as the
 * underlying library completes (or throws).
 */
export async function createBackup(): Promise<{
  ok: boolean
  id?: string
  error?: string
}> {
  let user
  try {
    user = await requireSuperAdmin()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  // Pre-create the row in PENDING status. We'll update it as the dump runs.
  const pending = await prisma.backup.create({
    data: {
      status: "PENDING",
      trigger: "manual",
      filename: `backup-pending-${Date.now()}.json`,
      filePath: "/pending",
      createdById: user.id,
      createdByName: user.email,
    },
  })

  try {
    await prisma.backup.update({
      where: { id: pending.id },
      data: { status: "IN_PROGRESS" },
    })

    const result = await createDatabaseBackup()

    await prisma.backup.update({
      where: { id: pending.id },
      data: {
        status: "SUCCESS",
        filename: result.filename,
        filePath: result.filePath,
        sizeBytes: BigInt(result.sizeBytes),
        tableCounts: result.tableCounts,
        tableCount: result.tableCount,
        checksum: result.checksum,
        // Persist the off-host copy info — when S3 is configured these are
        // populated; otherwise they fall back to the column defaults
        // (`storageProvider = "local"`, `storageUrl = null`).
        storageProvider: result.storageProvider,
        ...(result.storageUrl ? { storageUrl: result.storageUrl } : {}),
        finishedAt: new Date(),
      },
    })

    revalidatePath("/dashboard/backup")
    return { ok: true, id: pending.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[createBackup] failed:", err)
    await prisma.backup.update({
      where: { id: pending.id },
      data: {
        status: "FAILED",
        error: message.slice(0, 1000),
        finishedAt: new Date(),
      },
    })
    revalidatePath("/dashboard/backup")
    return { ok: false, id: pending.id, error: message }
  }
}

/** Shape returned by {@link listBackups}; matches the BackupClient props. */
export interface BackupRow {
  id: string
  filename: string
  filePath: string
  sizeBytes: number
  tableCount: number
  tableCounts: Record<string, number>
  trigger: string
  status: string
  error: string | null
  checksum: string | null
  createdById: string | null
  createdByName: string | null
  createdAt: string
  finishedAt: string | null
}

/** Coerce a Prisma `Json` value into the `Record<string, number>` shape we
 *  promised the client. Anything that isn't a plain object is replaced with
 *  an empty record so the UI never crashes on a malformed row. */
function coerceTableCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v
    else if (typeof v === "string" && /^\d+$/.test(v)) out[k] = Number(v)
    else if (typeof v === "bigint") out[k] = Number(v)
  }
  return out
}

/** Serialize a Prisma Backup row into the plain shape the client expects. */
function serialize(b: Awaited<ReturnType<typeof prisma.backup.findFirst>>): BackupRow | null {
  if (!b) return null
  return {
    id: b.id,
    filename: b.filename,
    filePath: b.filePath,
    sizeBytes: Number(b.sizeBytes),
    tableCount: b.tableCount,
    tableCounts: coerceTableCounts(b.tableCounts),
    trigger: b.trigger,
    status: b.status,
    error: b.error,
    checksum: b.checksum,
    createdById: b.createdById,
    createdByName: b.createdByName,
    createdAt: b.createdAt.toISOString(),
    finishedAt: b.finishedAt ? b.finishedAt.toISOString() : null,
  }
}

/**
 * List every backup record, newest first. Pure-read — no auth check needed
 * beyond the page-level guard because the only caller is the backup page
 * (which already requires SUPER_ADMIN). Kept open so the page component
 * can fetch directly via Prisma without going through this action.
 */
export async function listBackups(): Promise<BackupRow[]> {
  await requireSuperAdmin().catch(() => {
    throw new Error("Unauthorized")
  })
  const rows = await prisma.backup.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  })
  return rows.map(serialize).filter((r): r is BackupRow => r !== null)
}

/**
 * Look up a single backup record. Used by the download API route to
 * resolve an id → file path. Returns null when the row doesn't exist.
 */
export async function getBackupById(id: string): Promise<BackupRow | null> {
  const row = await prisma.backup.findUnique({ where: { id } })
  return serialize(row)
}

/**
 * Delete a backup record AND its underlying file. The row is removed even
 * if the file is already gone (orphaned record cleanup). Returns ok=false
 * only when the row never existed.
 */
export async function deleteBackup(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireSuperAdmin()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  const row = await prisma.backup.findUnique({ where: { id } })
  if (!row) return { ok: false, error: "Backup not found." }

  // Best-effort file deletion — don't fail the action if the file is gone.
  if (row.filePath && row.filePath !== "/pending") {
    await deleteBackupFile(row.filePath).catch(() => {
      /* swallowed — record deletion below still proceeds */
    })
  }

  await prisma.backup.delete({ where: { id } })
  revalidatePath("/dashboard/backup")
  return { ok: true }
}

/** Live row counts per table — feeds the "what will I back up?" preview. */
export interface BackupStats {
  tableCount: number
  rowCount: number
  tables: TableCountEntry[]
}

export async function getBackupStats(): Promise<BackupStats> {
  await requireSuperAdmin().catch(() => {
    throw new Error("Unauthorized")
  })
  return getDatabaseStats()
}

// ─── Restore ──────────────────────────────────────────────────────────────

/**
 * Restore a previously-taken backup into the database.
 *
 * ⚠️ DESTRUCTIVE — every row in every table present in the backup file is
 * DELETED before the backed-up rows are inserted. Tables NOT in the backup
 * file are left untouched.
 *
 * The caller MUST require explicit confirmation — this action does NOT prompt.
 * Returns a per-table count of restored rows for the UI to surface.
 */
export async function restoreBackup(
  id: string,
  opts: { confirmFilename?: string } = {},
): Promise<{ ok: boolean; result?: RestoreResult; error?: string }> {
  let user
  try {
    user = await requireSuperAdmin()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  const row = await prisma.backup.findUnique({ where: { id } })
  if (!row) return { ok: false, error: "Backup not found." }
  if (row.status !== "SUCCESS") {
    return { ok: false, error: `Backup status is ${row.status}; only SUCCESS backups can be restored.` }
  }
  if (!row.filePath || row.filePath === "/pending") {
    return { ok: false, error: "Backup file path is missing." }
  }

  // Defense-in-depth: if the caller passed a confirmFilename, it must match.
  // This prevents accidental restore when the UI state is stale.
  if (opts.confirmFilename && opts.confirmFilename !== row.filename) {
    return {
      ok: false,
      error: `Filename mismatch — expected "${opts.confirmFilename}" but the backup row says "${row.filename}".`,
    }
  }

  try {
    const result = await restoreDatabaseBackup(row.filePath)

    // Persist a row in the Backup table (with trigger="restore") so there's
    // an audit trail of when restores happened + who triggered them.
    await prisma.backup.create({
      data: {
        status: "SUCCESS",
        trigger: "restore",
        filename: `restore-of-${row.filename}`,
        filePath: row.filePath,
        sizeBytes: row.sizeBytes,
        tableCounts: result.tableCounts,
        tableCount: result.tableCount,
        checksum: row.checksum,
        storageProvider: "local",
        createdById: user.id,
        createdByName: user.email,
        finishedAt: new Date(),
      },
    })

    revalidatePath("/dashboard/backup")
    return { ok: true, result }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[restoreBackup] failed:", err)
    return { ok: false, error: message }
  }
}
