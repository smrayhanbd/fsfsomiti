"use client"

/**
 * BackupClient — UI for the System & Settings → Cloud Backup page.
 *
 * Two tabs:
 *   • Backups   — list of every snapshot, with create / download / delete.
 *   • Settings  — storage location + auto-backup schedule (placeholder for
 *                 future cron / external-trigger integration).
 *
 * The "Create Backup Now" button calls the `createBackup` server action and
 * shows live toasts for success / failure. While a backup is running the
 * button is disabled and a spinner is shown — long dumps (large DBs) take
 * a while because every table is fetched in a single round-trip.
 */
import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  Cloud,
  Database,
  Download,
  Trash2,
  Plus,
  RefreshCw,
  HardDrive,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  FileJson,
  ChevronRight,
  RotateCcw,
} from "lucide-react"

import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import {
  createBackup,
  deleteBackup,
  restoreBackup,
  type BackupRow,
} from "@/app/actions/backup"

// ─── Types ────────────────────────────────────────────────────────────────

interface TableCountEntry {
  name: string
  count: number
}

interface BackupStats {
  tableCount: number
  rowCount: number
  tables: TableCountEntry[]
}

interface BackupClientProps {
  backups: BackupRow[]
  stats: BackupStats
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Format a byte count as a human-readable string (1024-based, 1 decimal). */
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const val = bytes / Math.pow(1024, i)
  return `${val.toFixed(val >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

/** Format an ISO timestamp as a friendly "Aug 6, 2026, 12:34 PM" string. */
function formatDateTime(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** Format an ISO timestamp as a relative "5 minutes ago" string. */
function formatRelative(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const diff = Date.now() - d.getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return "just now"
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  return formatDateTime(iso)
}

/** Tailwind classes for a given backup status pill. */
function statusPill(status: string): { label: string; className: string; Icon: typeof CheckCircle2 } {
  switch (status) {
    case "SUCCESS":
      return {
        label: "Success",
        className: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
        Icon: CheckCircle2,
      }
    case "FAILED":
      return {
        label: "Failed",
        className: "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
        Icon: AlertCircle,
      }
    case "IN_PROGRESS":
      return {
        label: "Running",
        className: "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
        Icon: Loader2,
      }
    case "PENDING":
    default:
      return {
        label: "Pending",
        className: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
        Icon: Clock,
      }
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  sub,
  Icon,
}: {
  label: string
  value: string
  sub?: string
  Icon: typeof Database
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--border-base)] bg-surface p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-gradient-soft text-brand [&>svg]:h-[18px] [&>svg]:w-[18px]">
        <Icon />
      </span>
      <div className="min-w-0">
        <p className="t-overline text-faint-ink">{label}</p>
        <p className="t-h3 text-primary-ink leading-tight">{value}</p>
        {sub && <p className="t-caption text-muted-ink truncate">{sub}</p>}
      </div>
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-subtle text-muted-ink">
        <Cloud className="h-6 w-6" />
      </div>
      <div>
        <p className="t-h3 text-primary-ink">No backups yet</p>
        <p className="t-body text-muted-ink mt-1">
          Create your first database snapshot. It will be stored on the server
          and available for download immediately.
        </p>
      </div>
      <Button onClick={onCreate} className="mt-2">
        <Plus className="h-4 w-4 mr-1" /> Create First Backup
      </Button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────

export default function BackupClient({ backups, stats }: BackupClientProps) {
  const [isPending, startTransition] = useTransition()
  const [rows, setRows] = useState<BackupRow[]>(backups)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Restore dialog state — null when closed, otherwise the row being restored.
  const [restoreTarget, setRestoreTarget] = useState<BackupRow | null>(null)
  // Type-to-confirm input — must match the backup filename to enable the button.
  const [confirmText, setConfirmText] = useState("")
  const [restoreUnderstood, setRestoreUnderstood] = useState(false)

  const handleCreate = () => {
    startTransition(async () => {
      const res = await createBackup()
      if (res.ok) {
        toast.success("Backup created successfully.")
        // The server action revalidated the path, so the page will refresh
        // on next render. We also optimistically prepend a placeholder so
        // the user gets immediate feedback.
        // Forcing a soft reload via router.refresh() is the cleanest path.
        window.location.reload()
      } else {
        toast.error(res.error || "Backup failed.")
        // Even on failure, the row was created with status=FAILED — reload
        // so the user sees it in the list.
        window.location.reload()
      }
    })
  }

  const handleDelete = (id: string, filename: string) => {
    if (!confirm(`Delete backup "${filename}"? This cannot be undone.`)) return
    setBusyId(id)
    startTransition(async () => {
      const res = await deleteBackup(id)
      if (res.ok) {
        toast.success("Backup deleted.")
        setRows((prev) => prev.filter((r) => r.id !== id))
      } else {
        toast.error(res.error || "Failed to delete backup.")
      }
      setBusyId(null)
    })
  }

  const handleDownload = (id: string) => {
    // Use a direct anchor so the browser handles the download natively.
    const a = document.createElement("a")
    a.href = `/api/backup/${id}/download`
    a.download = ""
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // Open the restore confirmation dialog.
  const openRestoreDialog = (b: BackupRow) => {
    setRestoreTarget(b)
    setConfirmText("")
    setRestoreUnderstood(false)
  }

  // Actually execute the restore — called from the dialog's confirm button.
  const handleRestore = () => {
    if (!restoreTarget) return
    if (!restoreUnderstood) return
    if (confirmText !== restoreTarget.filename) return
    const target = restoreTarget
    setBusyId(target.id)
    startTransition(async () => {
      const res = await restoreBackup(target.id, { confirmFilename: target.filename })
      setBusyId(null)
      setRestoreTarget(null)
      setConfirmText("")
      setRestoreUnderstood(false)
      if (res.ok && res.result) {
        const r = res.result
        toast.success(
          `Restore complete: ${r.rowCount.toLocaleString()} rows across ${r.tableCount} tables in ${(r.durationMs / 1000).toFixed(1)}s.`,
        )
        // Reload the page so the audit-trail row (trigger="restore") appears.
        window.location.reload()
      } else {
        toast.error(res.error || "Restore failed.")
      }
    })
  }

  // ── Derived stats for the summary tiles ──
  const successCount = rows.filter((r) => r.status === "SUCCESS").length
  const failedCount = rows.filter((r) => r.status === "FAILED").length
  const totalSize = rows.filter((r) => r.status === "SUCCESS").reduce((sum, r) => sum + (r.sizeBytes || 0), 0)
  const lastBackup = rows.find((r) => r.status === "SUCCESS")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cloud Backup"
        subtitle="Database snapshots for disaster recovery. Each backup captures every table in the public schema as a single downloadable JSON file."
        overline="System & Settings"
        actions={
          <Button onClick={handleCreate} disabled={isPending} className="min-w-[160px]">
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Backing up…
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" /> Create Backup Now
              </>
            )}
          </Button>
        }
      />

      <Tabs defaultValue="backups">
        <TabsList>
          <TabsTrigger value="backups">
            <Database className="h-4 w-4" /> Backups
          </TabsTrigger>
          <TabsTrigger value="settings">
            <ShieldCheck className="h-4 w-4" /> Settings
          </TabsTrigger>
        </TabsList>

        {/* ─── Backups tab ─── */}
        <TabsContent value="backups" className="space-y-6 pt-4">
          {/* Stats tiles */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Total Backups"
              value={String(successCount)}
              sub={`${failedCount} failed`}
              Icon={Cloud}
            />
            <StatTile
              label="Storage Used"
              value={formatBytes(totalSize)}
              sub="Across all successful backups"
              Icon={HardDrive}
            />
            <StatTile
              label="Last Backup"
              value={lastBackup ? formatRelative(lastBackup.createdAt) : "Never"}
              sub={lastBackup ? formatDateTime(lastBackup.createdAt) : "No backups yet"}
              Icon={Clock}
            />
            <StatTile
              label="DB Tables"
              value={String(stats.tableCount)}
              sub={`${stats.rowCount.toLocaleString()} rows total`}
              Icon={Database}
            />
          </div>

          {/* Live DB preview */}
          {stats.tables.length > 0 && (
            <SectionCard
              icon={<Database />}
              title="Database Preview"
              subtitle={`${stats.tableCount} tables · ${stats.rowCount.toLocaleString()} rows will be included in the next snapshot`}
              accent="violet"
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {stats.tables
                  .slice()
                  .sort((a, b) => b.count - a.count)
                  .map((t) => (
                    <div
                      key={t.name}
                      className="flex items-center justify-between rounded-lg border border-[var(--border-base)] bg-surface px-3 py-2"
                    >
                      <span className="t-caption text-secondary-ink truncate font-mono" title={t.name}>
                        {t.name}
                      </span>
                      <span className="t-caption text-faint-ink ml-2 shrink-0 tabular-nums">
                        {t.count.toLocaleString()}
                      </span>
                    </div>
                  ))}
              </div>
            </SectionCard>
          )}

          {/* Backups table */}
          <SectionCard
            icon={<FileJson />}
            title="Backup History"
            subtitle="Newest first — most recent 200 backups shown"
            accent="blue"
            bodyClassName="p-0"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
                disabled={isPending}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isPending ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            }
          >
            {rows.length === 0 ? (
              <EmptyState onCreate={handleCreate} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[28%]">Filename</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead className="text-right">Tables</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((b) => {
                    const pill = statusPill(b.status)
                    return (
                      <TableRow key={b.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileJson className="h-4 w-4 shrink-0 text-muted-ink" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-primary-ink" title={b.filename}>
                                {b.filename}
                              </p>
                              {b.createdByName && (
                                <p className="text-[11px] text-muted-ink truncate">
                                  by {b.createdByName}
                                </p>
                              )}
                            </div>
                          </div>
                          {b.error && (
                            <p className="mt-1 text-[11px] text-red-600 dark:text-red-400 line-clamp-2" title={b.error}>
                              {b.error}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${pill.className}`}
                          >
                            <pill.Icon
                              className={`h-3 w-3 ${b.status === "IN_PROGRESS" ? "animate-spin" : ""}`}
                            />
                            {pill.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-secondary-ink">
                          {b.status === "SUCCESS" ? formatBytes(b.sizeBytes) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-secondary-ink">
                          {b.tableCount > 0 ? b.tableCount : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-secondary-ink">
                          <div>{formatRelative(b.createdAt)}</div>
                          <div className="text-[11px] text-muted-ink">
                            {formatDateTime(b.createdAt)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {b.status === "SUCCESS" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleDownload(b.id)}
                                title="Download JSON"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            {b.status === "SUCCESS" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                onClick={() => openRestoreDialog(b)}
                                disabled={busyId === b.id || isPending}
                                title="Restore this backup"
                              >
                                {busyId === b.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                              onClick={() => handleDelete(b.id, b.filename)}
                              disabled={busyId === b.id || isPending}
                              title="Delete backup"
                            >
                              {busyId === b.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </TabsContent>

        {/* ─── Settings tab ─── */}
        <TabsContent value="settings" className="pt-4">
          <SectionCard
            icon={<ShieldCheck />}
            title="Backup Configuration"
            subtitle="Where snapshots are stored and how the schedule is configured"
            accent="emerald"
          >
            <div className="space-y-6">
              {/* Storage location */}
              <div className="space-y-2">
                <h3 className="t-h3 text-primary-ink">Storage Location</h3>
                <p className="t-body text-muted-ink">
                  Backups are written to a directory on the server. Configure
                  the path with the <code className="rounded bg-subtle px-1.5 py-0.5 text-[12px] font-mono">BACKUP_STORAGE_DIR</code>{" "}
                  environment variable; if unset, the default is{" "}
                  <code className="rounded bg-subtle px-1.5 py-0.5 text-[12px] font-mono">./backups</code>{" "}
                  relative to the Next.js project root.
                </p>
                <div className="rounded-lg border border-[var(--border-base)] bg-surface p-3">
                  <p className="t-overline text-faint-ink">Resolved path on this server</p>
                  <p className="mt-1 font-mono text-sm text-primary-ink break-all">
                    {/* This is rendered server-side via the env, but since the
                        client doesn't know it, we surface a friendly note. */}
                    Configured via <span className="font-semibold">BACKUP_STORAGE_DIR</span> env var
                  </p>
                </div>
              </div>

              {/* File format */}
              <div className="space-y-2">
                <h3 className="t-h3 text-primary-ink">File Format</h3>
                <p className="t-body text-muted-ink">
                  Each backup is a single JSON file containing every table in
                  the <code className="rounded bg-subtle px-1.5 py-0.5 text-[12px] font-mono">public</code>{" "}
                  schema (Prisma&apos;s own <code className="rounded bg-subtle px-1.5 py-0.5 text-[12px] font-mono">_prisma_migrations</code>{" "}
                  table is excluded). The structure is:
                </p>
                <pre className="overflow-x-auto rounded-lg border border-[var(--border-base)] bg-surface p-3 font-mono text-xs text-secondary-ink">
{`{
  "_meta": {
    "version": 1,
    "createdAt": "2026-08-06T12:34:56.789Z",
    "databaseUrlHash": "a1b2c3d4",
    "tableCount": 47,
    "rowCount": 12345
  },
  "tables": {
    "User":   [ { ... }, { ... } ],
    "Member": [ { ... }, { ... } ],
    ...
  }
}`}
                </pre>
                <p className="t-caption text-muted-ink">
                  Non-JSON types are normalised: <span className="font-mono">Decimal</span> →{" "}
                  string, <span className="font-mono">BigInt</span> → string,{" "}
                  <span className="font-mono">Date</span> → ISO string,{" "}
                  <span className="font-mono">bytea</span> → base64.
                </p>
              </div>

              {/* Restore */}
              <div className="space-y-2">
                <h3 className="t-h3 text-primary-ink">Restoring a Backup</h3>
                <p className="t-body text-muted-ink">
                  Use the{" "}
                  <RotateCcw className="inline h-3.5 w-3.5 text-amber-600 align-text-bottom" />{" "}
                  <strong>Restore</strong> button on any backup row to bring the
                  database back to that snapshot&apos;s state. The restore is{" "}
                  <strong>destructive</strong> — every row in every backed-up
                  table is replaced — so you&apos;ll be asked to type the backup
                  filename to confirm.
                </p>
                <p className="t-body text-muted-ink">
                  The restore runs inside a single database transaction, so a
                  partial failure rolls everything back. Tables that aren&apos;t in
                  the backup file (e.g. new tables created after the backup)
                  are left untouched.
                </p>
                <p className="t-body text-muted-ink">
                  Each restore is logged in the backup list as a row with{" "}
                  <code className="rounded bg-subtle px-1.5 py-0.5 text-[12px] font-mono">
                    trigger=restore
                  </code>{" "}
                  so you have an audit trail of when restores happened and who
                  triggered them.
                </p>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                  <p className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      <strong>Caution:</strong> Always test a restore on a
                      staging database first. While the restore is transactional,
                      a successful restore still overwrites live production data.
                    </span>
                  </p>
                </div>
              </div>

              {/* Scheduling */}
              <div className="space-y-2">
                <h3 className="t-h3 text-primary-ink">Automatic Schedule</h3>
                <p className="t-body text-muted-ink">
                  Scheduled backups are not yet wired up. The infrastructure
                  supports a <code className="rounded bg-subtle px-1.5 py-0.5 text-[12px] font-mono">trigger=&quot;scheduled&quot;</code>{" "}
                  flag on the Backup model, and a future cron route will be
                  added at <code className="rounded bg-subtle px-1.5 py-0.5 text-[12px] font-mono">/api/cron/backup</code>{" "}
                  to run nightly dumps. For now, use the &quot;Create Backup Now&quot;
                  button on the Backups tab.
                </p>
              </div>

              {/* Permissions */}
              <div className="space-y-2">
                <h3 className="t-h3 text-primary-ink">Access Control</h3>
                <p className="t-body text-muted-ink">
                  Only the <strong>Super Admin</strong> can view, create,
                  download, or delete backups. The permission key is{" "}
                  <code className="rounded bg-subtle px-1.5 py-0.5 text-[12px] font-mono">
                    System &amp; Settings::Cloud Backup
                  </code>{" "}
                  and the actions are{" "}
                  <code className="rounded bg-subtle px-1.5 py-0.5 text-[12px] font-mono">create_backup</code>,{" "}
                  <code className="rounded bg-subtle px-1.5 py-0.5 text-[12px] font-mono">download_backup</code>,{" "}
                  <code className="rounded bg-subtle px-1.5 py-0.5 text-[12px] font-mono">delete_backup</code>,{" "}
                  <code className="rounded bg-subtle px-1.5 py-0.5 text-[12px] font-mono">restore_backup</code>.
                </p>
                <Link
                  href="/dashboard/permissions/roles"
                  className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
                >
                  Manage role permissions
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>

      {/* ─── Restore confirmation dialog ─── */}
      <Dialog
        open={restoreTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRestoreTarget(null)
            setConfirmText("")
            setRestoreUnderstood(false)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Restore backup — destructive operation
            </DialogTitle>
            <DialogDescription>
              You&apos;re about to restore{" "}
              <strong className="font-mono text-primary-ink">
                {restoreTarget?.filename}
              </strong>
              . This will <strong>DELETE every row</strong> in every table
              present in the backup file, then insert the backed-up rows.
              Tables not in the backup file are left untouched.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
              <p className="text-sm text-red-800 dark:text-red-200">
                <strong>⚠️ Warnings:</strong>
              </p>
              <ul className="mt-1 list-disc pl-5 text-sm text-red-800 dark:text-red-200 space-y-0.5">
                <li>All current data in backed-up tables will be lost.</li>
                <li>If you have written new transactions since this backup, they will be gone.</li>
                <li>The restore runs inside a single transaction — partial failures roll back.</li>
                <li>The restore is logged as an audit-trail row with trigger=&quot;restore&quot;.</li>
              </ul>
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={restoreUnderstood}
                onChange={(e) => setRestoreUnderstood(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm text-secondary-ink">
                I understand this operation <strong>overwrites live data</strong> and
                cannot be undone (except by restoring another backup).
              </span>
            </label>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-secondary-ink">
                Type the backup filename to confirm:
              </label>
              <code className="block rounded bg-subtle px-2 py-1.5 text-xs font-mono text-primary-ink">
                {restoreTarget?.filename}
              </code>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={restoreTarget?.filename}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setRestoreTarget(null)
                setConfirmText("")
                setRestoreUnderstood(false)
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRestore}
              disabled={
                !restoreUnderstood ||
                confirmText !== restoreTarget?.filename ||
                isPending
              }
              className="gap-2"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Restore now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
