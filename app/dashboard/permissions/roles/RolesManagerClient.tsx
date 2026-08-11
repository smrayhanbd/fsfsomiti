"use client"

// Role Manager client — table of roles + "New Role" modal + per-row actions.
// Calls POST/PATCH/DELETE on /api/permissions/roles/*.

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { Shield, Plus, Trash2, Settings2, ArrowLeft, Lock } from "lucide-react"
import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"
import { safeFetch } from "@/lib/safe-fetch"

export interface RoleRow {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  isSuperAdmin: boolean
  userCount: number
  permissionCount: number
  createdAt: string
}

export default function RolesManagerClient({ roles }: { roles: RoleRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")

  const handleCreate = () => {
    if (!newName.trim()) return toast.error("Role name is required.")
    startTransition(async () => {
      const r = await safeFetch<{ id: string }>("/api/permissions/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
      })
      if (!r.ok) { toast.error(r.title, { description: r.description }); return }
      toast.success("Role created", { description: newName.trim() })
      setShowNew(false); setNewName(""); setNewDesc("")
      router.refresh()
    })
  }

  const handleDelete = (role: RoleRow) => {
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return
    startTransition(async () => {
      const r = await safeFetch(`/api/permissions/roles/${role.id}`, { method: "DELETE" })
      if (!r.ok) { toast.error(r.title, { description: r.description }); return }
      toast.success("Role deleted", { description: role.name })
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Role Management"
        subtitle="Define roles and the permissions each one grants"
        actions={
          <div className="flex gap-2">
            <Link href="/dashboard/permissions"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button></Link>
            <Button className="brand-gradient shadow-brand-glow" onClick={() => setShowNew(true)}>
              <Plus className="mr-2 h-4 w-4" /> New Role
            </Button>
          </div>
        }
      />

      <SectionCard title="All Roles" icon={<Shield />} accent="blue" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-base)] bg-subtle/60">
                <th className="t-overline px-4 py-3 text-left text-muted-ink">Role</th>
                <th className="t-overline px-4 py-3 text-left text-muted-ink">Description</th>
                <th className="t-overline px-4 py-3 text-center text-muted-ink">Members</th>
                <th className="t-overline px-4 py-3 text-center text-muted-ink">Permissions</th>
                <th className="t-overline px-4 py-3 text-right text-muted-ink">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border-base)] hover:bg-subtle/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-primary-ink">{r.name}</span>
                      {r.isSuperAdmin && (
                        <span className="rounded-full bg-brand-gradient-soft px-2 py-0.5 text-[10px] font-bold uppercase text-brand">Super</span>
                      )}
                      {r.isSystem && (
                        <span title="System role — cannot be deleted or renamed">
                          <Lock className="h-3.5 w-3.5 text-muted-ink" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-secondary-ink">{r.description ?? "—"}</td>
                  <td className="px-4 py-3 text-center text-secondary-ink">{r.userCount}</td>
                  <td className="px-4 py-3 text-center text-secondary-ink">
                    {r.isSuperAdmin ? "ALL" : r.permissionCount}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Link href={`/dashboard/permissions/roles/${r.id}`}>
                        <Button variant="outline" size="sm" disabled={r.isSuperAdmin}>
                          <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Permissions
                        </Button>
                      </Link>
                      <Button
                        variant="ghost" size="sm" className="text-debit"
                        disabled={isPending || r.isSystem}
                        onClick={() => handleDelete(r)}
                        title={r.isSystem ? "System roles can't be deleted" : "Delete role"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* New Role modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowNew(false)}>
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-base)] bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="t-h3 text-primary-ink">Create Role</h3>
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Branch Operator" className="bg-[var(--control-bg)]" />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} placeholder="What this role can do…" className="bg-[var(--control-bg)]" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button className="brand-gradient" disabled={isPending} onClick={handleCreate}>
                {isPending ? "Creating…" : "Create Role"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
