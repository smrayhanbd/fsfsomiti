/**
 * Scheduled backup runner — shared by the /api/backup/run route (manual
 * admin trigger + legacy Vercel Cron compatibility) and the Inngest
 * scheduled-backup function.
 *
 * Extracted from app/api/backup/run/route.ts so both callers use the
 * exact same logic. The route handler still owns auth + idempotency;
 * this function owns the Backup row lifecycle + the actual backup work.
 *
 * Server-only.
 */
import prisma from "@/lib/prisma"
import { createDatabaseBackup } from "@/lib/backup"
import { logger } from "@/lib/logger"

export interface ScheduledBackupResult {
  ok: boolean
  backupId: string
  filename?: string
  filePath?: string
  sizeBytes?: number
  storageUrl?: string
  error?: string
}

/**
 * Run a scheduled backup end-to-end:
 *   1. Create a PENDING Backup row (audit trail even on crash)
 *   2. Mark IN_PROGRESS
 *   3. Run createDatabaseBackup() (dumps all tables → JSON → S3)
 *   4. Mark SUCCESS with file metadata, OR
 *   5. Mark FAILED with the error message
 *
 * `triggeredBy` is recorded on the Backup row so the dashboard can
 * distinguish Inngest-triggered runs from manual admin triggers.
 */
export async function runScheduledBackup(
  triggeredBy: "inngest" | "vercel-cron" | "admin" = "inngest"
): Promise<ScheduledBackupResult> {
  const pending = await prisma.backup.create({
    data: {
      status: "PENDING",
      trigger: "scheduled",
      filename: `backup-pending-${Date.now()}.json`,
      filePath: "/pending",
      createdByName: triggeredBy,
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
        storageProvider: result.storageProvider,
        ...(result.storageUrl ? { storageUrl: result.storageUrl } : {}),
        finishedAt: new Date(),
      },
    })

    logger.info(
      { backupId: pending.id, storageUrl: result.storageUrl, triggeredBy },
      "[runScheduledBackup] succeeded",
    )

    return {
      ok: true,
      backupId: pending.id,
      filename: result.filename,
      filePath: result.filePath,
      sizeBytes: result.sizeBytes,
      storageUrl: result.storageUrl ?? undefined,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ err, backupId: pending.id, triggeredBy }, "[runScheduledBackup] failed")

    await prisma.backup.update({
      where: { id: pending.id },
      data: {
        status: "FAILED",
        error: message.slice(0, 1000),
        finishedAt: new Date(),
      },
    }).catch(() => {
      /* best-effort — the row may already be in a terminal state */
    })

    return {
      ok: false,
      backupId: pending.id,
      error: message.slice(0, 200),
    }
  }
}
