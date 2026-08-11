/**
 * POST /api/backup/run
 *
 * Vercel Cron entry-point — triggers a full database backup at 02:00 UTC
 * daily (see vercel.json `crons`). Auth is via the `CRON_SECRET` env var:
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` on every cron invocation,
 * and we compare it in constant time to avoid timing attacks.
 *
 * Why a route instead of a server action:
 *   - Vercel Cron can only hit URLs, not server actions.
 *   - The route is unauthenticated-by-cookie (cron has no session), so we
 *     need a different auth path.
 *
 * Response:
 *   200  { ok: true, backupId }
 *   401  { error: "Unauthorized" }    — missing/wrong CRON_SECRET
 *   500  { ok: false, error }         — backup failed (see Backup row error column)
 *
 * NOTE: the actual backup runs via `createDatabaseBackup()` from
 * lib/backup/index.ts, which now also pushes the file to S3 when configured.
 * The Backup row is created/updated here so the dashboard shows the run.
 */
import { NextResponse, type NextRequest } from "next/server"
import { timingSafeEqual } from "node:crypto"

import prisma from "@/lib/prisma"
import { createDatabaseBackup } from "@/lib/backup"
import { getRequestLogger } from "@/lib/logger"

export const dynamic = "force-dynamic"

/**
 * Constant-time string compare. Returns true iff `a` and `b` are equal in
 * both length and contents. Avoids the classic timing-attack oracle where
 * a string `===` comparison short-circuits on the first mismatched byte.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export async function POST(req: NextRequest) {
  const log = getRequestLogger()

  // ── Auth: Bearer CRON_SECRET ───────────────────────────────────────────
  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : ""
  const secret = process.env.CRON_SECRET

  if (!secret || !token || !safeEqual(token, secret)) {
    log.warn("[/api/backup/run] unauthorized cron attempt")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // ── Run the backup ─────────────────────────────────────────────────────
  // Pre-create the row so we can update it on success/failure rather than
  // losing the audit trail on a crash. Same pattern as the manual `createBackup`
  // server action in app/actions/backup.ts.
  const pending = await prisma.backup.create({
    data: {
      status: "PENDING",
      trigger: "scheduled",
      filename: `backup-pending-${Date.now()}.json`,
      filePath: "/pending",
      createdByName: "vercel-cron",
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

    log.info(
      { backupId: pending.id, storageUrl: result.storageUrl },
      "[/api/backup/run] scheduled backup succeeded",
    )

    return NextResponse.json({ ok: true, backupId: pending.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.error({ err, backupId: pending.id }, "[/api/backup/run] scheduled backup failed")

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

    return NextResponse.json(
      { ok: false, error: message.slice(0, 200), backupId: pending.id },
      { status: 500 },
    )
  }
}

// Vercel Cron also issues a GET (for warm-up probes); respond 200 so the
// probe doesn't trigger an alert, but don't run the backup on a GET —
// only POST is allowed to start one.
export async function GET() {
  return NextResponse.json({ ok: true, message: "backup runner ready" })
}
