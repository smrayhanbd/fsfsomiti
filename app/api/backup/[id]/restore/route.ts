/**
 * POST /api/backup/[id]/restore — restore a backup into the DB.
 *
 * ⚠️ Destructive — every row in every backed-up table is replaced.
 *
 * Auth: SUPER_ADMIN only. The session check happens in the `restoreBackup`
 * server action (which this route delegates to) — defense in depth.
 *
 * Body (optional):
 *   { "confirmFilename": "backup-2026-08-11-abc123.json" }
 *
 * Returns the RestoreResult on success.
 */
import { NextResponse } from "next/server"
import { restoreBackup } from "@/app/actions/backup"

export const dynamic = "force-dynamic"
export const maxDuration = 600 // 10 min — large restores take time

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
