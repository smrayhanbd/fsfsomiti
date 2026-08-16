/**
 * POST /api/backup/[id]/restore — restore a backup into the DB.
 *
 * ⚠️ Destructive — every row in every backed-up table is replaced.
 *
 * Auth: SUPER_ADMIN only. The route handler checks super admin directly
 * (defense-in-depth) before delegating to the `restoreBackup` server action
 * which also checks.
 *
 * Body (optional):
 *   { "confirmFilename": "backup-2026-08-11-abc123.json" }
 *
 * Returns the RestoreResult on success.
 */
import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser, isSuperAdmin } from "@/lib/permissions"
import { restoreBackup } from "@/app/actions/backup"

export const dynamic = "force-dynamic"
// Vercel Hobby caps serverless function execution at 300s. Restores of large
// backups can take a while (DB writes for every table), so we use the full
// Hobby budget. If you upgrade to Pro, you can bump this to 600 (10 min).
export const maxDuration = 300

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Auth: SUPER_ADMIN only ─────────────────────────────────────────────
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isSuperAdmin(user)) {
    return NextResponse.json(
      { error: "Only Super Admins can restore backups." },
      { status: 403 }
    )
  }

  const { id } = await params
  let confirmFilename: string | undefined
  try {
    const body = await request.json()
    confirmFilename = body?.confirmFilename
  } catch {
    // No JSON body — that's fine, restoreBackup works without it.
  }

  const res = await restoreBackup(id, { confirmFilename })
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true, result: res.result })
}
