import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { getCurrentUser, isSuperAdmin } from "@/lib/permissions"
import { getDatabaseStats } from "@/lib/backup"
import { plain } from "@/lib/serialize"
import type { BackupRow } from "@/app/actions/backup"
import BackupClient from "./BackupClient"

export const dynamic = "force-dynamic"

/**
 * Coerce the Json-typed `tableCounts` column into the
 * `Record<string, number>` shape promised to the client. Mirrors the
 * helper in app/actions/backup.ts so the page and the action return the
 * same shape.
 */
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

/**
 * System & Settings → Cloud Backup.
 *
 * Lists every {@link Backup} row (newest first), plus a live preview of
 * the per-table row counts that would be included in the next snapshot.
 * SUPER_ADMIN-only — non-super-admins are bounced back to the dashboard.
 */
export default async function CloudBackupPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  if (!isSuperAdmin(user)) redirect("/dashboard")

  const [backupRows, stats] = await Promise.all([
    prisma.backup.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    getDatabaseStats().catch((err) => {
      // The page should still render even if the stats query fails — the
      // admin can still trigger a backup. We log and fall back to zeros.
      console.error("[/dashboard/backup] getDatabaseStats failed:", err)
      return { tableCount: 0, rowCount: 0, tables: [] }
    }),
  ])

  // Serialise Prisma types (BigInt/Decimal/Date) before crossing the
  // Server→Client boundary, then coerce `tableCounts` from Json to the
  // typed shape BackupClient expects.
  const plainRows = plain(backupRows) as Array<{
    id: string
    filename: string
    filePath: string
    sizeBytes: number
    tableCount: number
    tableCounts: unknown
    trigger: string
    status: string
    error: string | null
    checksum: string | null
    createdById: string | null
    createdByName: string | null
    createdAt: string
    finishedAt: string | null
  }>
  const backups: BackupRow[] = plainRows.map((b) => ({
    ...b,
    tableCounts: coerceTableCounts(b.tableCounts),
  }))

  return <BackupClient backups={backups} stats={plain(stats)} />
}
