/**
 * GET /api/backup/[id]/download
 *
 * Streams a backup JSON file from disk to the browser as an attachment.
 *
 * Auth: same as the dashboard page — signed-in SUPER_ADMIN only. The auth
 * check is performed via the shared `getCurrentUser` / `isSuperAdmin`
 * helpers so behavior matches the page guard exactly.
 *
 * Responses:
 *   200  — file streamed with Content-Disposition: attachment
 *   401  — not signed in
 *   403  — signed in but not a super admin
 *   404  — backup record or file does not exist
 *   500  — file could not be read (filesystem error)
 */
import { NextResponse, type NextRequest } from "next/server"
import path from "node:path"

import prisma from "@/lib/prisma"
import { getCurrentUser, isSuperAdmin } from "@/lib/permissions"
import { getBackupStorageDir } from "@/lib/backup"

export const dynamic = "force-dynamic"
// Vercel Hobby caps serverless function execution at 300s. Large backup
// downloads (>50 MB) can take a while to stream, so we give it the full
// Hobby budget.
export const maxDuration = 300

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Auth ──────────────────────────────────────────────────────────────
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isSuperAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // ── Resolve the backup record ─────────────────────────────────────────
  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: "Missing backup id" }, { status: 400 })
  }

  const row = await prisma.backup.findUnique({ where: { id } })
  if (!row) {
    return NextResponse.json({ error: "Backup not found" }, { status: 404 })
  }

  // ── Resolve the file path ─────────────────────────────────────────────
  // We prefer the stored absolute path; if it doesn't exist (e.g. storage
  // dir moved), fall back to <storageDir>/<filename>.
  //
  // Use the hidden dynamic import for ALL fs operations in this route —
  // `fs.access` also triggers Turbopack's whole-project tracing when the
  // path is dynamic.
  const _import = new Function(
    "m",
    "return import(m)",
  ) as (m: string) => Promise<typeof import("node:fs/promises")>
  const _fs = await _import("node:fs/promises")

  const candidates = [row.filePath, path.join(getBackupStorageDir(), row.filename)]
  let filePath: string | null = null
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      await _fs.access(candidate)
      filePath = candidate
      break
    } catch {
      // try the next candidate
    }
  }

  if (!filePath) {
    return NextResponse.json(
      { error: "Backup file no longer exists on disk." },
      { status: 404 },
    )
  }

  // ── Stream the file ───────────────────────────────────────────────────
  let data: Buffer
  try {
    data = await _fs.readFile(filePath)
  } catch (err) {
    console.error("[backup/download] read failed:", err)
    return NextResponse.json(
      { error: "Failed to read backup file." },
      { status: 500 },
    )
  }

  // Filename for the browser: prefer the stored filename, fall back to id.
  const downloadName = row.filename || `backup-${row.id}.json`

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${downloadName}"`,
      "Content-Length": String(data.byteLength),
      // Don't cache — backup content is unique per id.
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
