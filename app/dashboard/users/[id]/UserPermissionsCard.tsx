"use client"

// ============================================================================
// UserPermissionsCard — the "Permissions & Roles" section on a user's detail
// page (spec Part 8C). Three panels:
//
//   1. Assigned Roles — list with add/remove controls. Calls the
//      /api/permissions/users/[userId]/roles endpoints.
//   2. Permission Overrides — ALLOW/DENY a specific permission key for this
//      user, independent of their roles. Includes a "when to use override vs
//      role" note. Calls the /overrides endpoints.
//   3. Effective Permissions — an expandable preview of what the user can
//      actually access, computed server-side and shipped as `effectiveKeys`.
//
// Visual style matches the existing Card/SectionCard look (glassmorphism,
// slate tokens) already used on the user detail page.

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { ShieldCheck, Plus, X, ChevronDown, ChevronRight, Info, Lock } from "lucide-react"
import { MENU_GROUP_TITLES, pagesOf, enumerateRegistry } from "@/lib/permissions/permission-registry"
import { safeFetch } from "@/lib/safe-fetch"

interface AssignedRole {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  isSuperAdmin: boolean
  assignedAt: string
}
interface UserOverride {
  id: string
  effect: "ALLOW" | "DENY"
  reason: string | null
  permission: { id: string; menuGroup: string; page: string; tab: string; action: string }
}
interface SelectableRole {
  id: string
  name: string
  isSystem: boolean
  isSuperAdmin: boolean
}

interface Props {
  userId: string
  assignedRoles: AssignedRole[]
  overrides: UserOverride[]
  effectiveKeys: string[]
  allRoles: SelectableRole[]
  canManage: boolean
}

export default function UserPermissionsCard({
  userId, assignedRoles, overrides, effectiveKeys, allRoles, canManage,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [addRoleId, setAddRoleId] = useState("")

  // Override form state.
  const [ovPermKey, setOvPermKey] = useState("")
  const [ovEffect, setOvEffect] = useState<"ALLOW" | "DENY">("DENY")
  const [ovReason, setOvReason] = useState("")

  // Effective-preview expansion.
  const [previewOpen, setPreviewOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const isSuper = assignedRoles.some((r) => r.isSuperAdmin)
  const grantedSet = new Set(effectiveKeys)

  // Roles the user doesn't yet have (for the add dropdown).
  const assignableRoles = allRoles.filter(
    (r) => !assignedRoles.some((ar) => ar.id === r.id)
  )

  // ── Role actions ──────────────────────────────────────────────────────
  const handleAssignRole = () => {
    if (!addRoleId) { toast.error("Pick a role to assign."); return }
    startTransition(async () => {
      const r = await safeFetch(`/api/permissions/users/${userId}/roles`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: addRoleId }),
      })
      if (!r.ok) { toast.error(r.title, { description: r.description }); return }
      toast.success("Role assigned")
      setAddRoleId("")
      router.refresh()
    })
  }

  const handleRevokeRole = (roleId: string, name: string) => {
    if (!confirm(`Remove role "${name}" from this user?`)) return
    startTransition(async () => {
      const r = await safeFetch(`/api/permissions/users/${userId}/roles/${roleId}`, { method: "DELETE" })
      if (!r.ok) { toast.error(r.title, { description: r.description }); return }
      toast.success("Role removed")
      router.refresh()
    })
  }

  // ── Override actions ──────────────────────────────────────────────────
  const handleAddOverride = () => {
    if (!ovPermKey.trim()) { toast.error("Enter a permission key."); return }
    // Validate the key exists in the registry client-side for a friendly error
    // before hitting the server (which resolves it to a Permission row).
    const node = enumerateRegistry().find((n) => n.key === ovPermKey.trim())
    if (!node) {
      toast.error("Unknown key", {
        description: "Use a key from the effective preview, e.g. Finance & Accounting::Loan Management::::approve_loan",
      })
      return
    }
    startTransition(async () => {
      // Send the natural key; the override POST accepts permissionId OR
      // permissionKey and resolves it server-side.
      const r = await safeFetch(`/api/permissions/users/${userId}/overrides`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissionKey: ovPermKey.trim(),
          effect: ovEffect,
          reason: ovReason.trim() || null,
        }),
      })
      if (!r.ok) { toast.error(r.title, { description: r.description }); return }
      toast.success(`${ovEffect} override added`)
      setOvPermKey(""); setOvReason("")
      router.refresh()
    })
  }

  const handleRemoveOverride = (permId: string) => {
    startTransition(async () => {
      const r = await safeFetch(`/api/permissions/users/${userId}/overrides/${permId}`, { method: "DELETE" })
      if (!r.ok) { toast.error(r.title, { description: r.description }); return }
      toast.success("Override removed")
      router.refresh()
    })
  }

  // ── Effective-preview grouping ────────────────────────────────────────
  const toggleGroup = (g: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })
  }

  const groupVisiblePages = (group: string): string[] => {
    const pages = pagesOf(group as typeof MENU_GROUP_TITLES[number])
    return pages.filter((page) => {
      const pk = `${group}::${page}`
      if (grantedSet.has(pk)) return true
      const prefix = `${pk}::`
      for (const k of grantedSet) if (k.startsWith(prefix)) return true
      return false
    })
  }

  return (
    <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
      <CardHeader>
        <CardTitle className="text-sm uppercase tracking-wider text-slate-500 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-indigo-500" /> Roles & Permissions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isSuper && (
          <p className="text-sm text-slate-500 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg p-3">
            <ShieldCheck className="inline h-4 w-4 mr-1 text-indigo-500" />
            This user is a <strong>Super Admin</strong> — full unrestricted access. Overrides below do not apply.
          </p>
        )}

        {/* ── 1. Assigned Roles ─────────────────────────────────────────── */}
        <div>
          <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2">
            Assigned Roles
          </p>
          {assignedRoles.length === 0 ? (
            <p className="text-sm text-slate-500">No roles assigned.</p>
          ) : (
            <div className="space-y-2">
              {assignedRoles.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{r.name}</span>
                    {r.isSystem && <Lock className="h-3 w-3 text-slate-400" />}
                  </div>
                  {canManage && (
                    <Button variant="ghost" size="sm" className="text-red-500 h-7" disabled={isPending} onClick={() => handleRevokeRole(r.id, r.name)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canManage && assignableRoles.length > 0 && (
            <div className="mt-2 flex gap-2">
              <Select value={addRoleId} onValueChange={(v) => setAddRoleId(v ?? "")}>
                <SelectTrigger className="bg-white dark:bg-slate-950 flex-1">
                  <SelectValue placeholder="Add a role…" />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={isPending} onClick={handleAssignRole}>
                <Plus className="h-4 w-4 mr-1" /> Assign
              </Button>
            </div>
          )}
        </div>

        {/* ── 2. Permission Overrides ───────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
              Permission Overrides
            </p>
            <span className="text-[10px] text-slate-400 flex items-center gap-1" title="Use a role for the default grant set; use an override to make a one-off exception (e.g. deny one action to one person).">
              <Info className="h-3 w-3" /> override vs role
            </span>
          </div>
          {overrides.length === 0 ? (
            <p className="text-sm text-slate-500">No overrides. The user gets exactly what their roles grant.</p>
          ) : (
            <div className="space-y-2">
              {overrides.map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={o.effect === "ALLOW" ? "default" : "destructive"} className="text-[10px]">{o.effect}</Badge>
                      <code className="text-xs text-slate-600 dark:text-slate-300 truncate">{permToKey(o.permission)}</code>
                    </div>
                    {o.reason && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{o.reason}</p>}
                  </div>
                  {canManage && (
                    <Button variant="ghost" size="sm" className="text-red-500 h-7" disabled={isPending} onClick={() => handleRemoveOverride(o.permission.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canManage && !isSuper && (
            <div className="mt-2 space-y-2 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-3">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                <Input
                  value={ovPermKey}
                  onChange={(e) => setOvPermKey(e.target.value)}
                  placeholder="Permission key, e.g. Finance & Accounting::Loan Management::::approve_loan"
                  className="bg-white dark:bg-slate-950 text-xs"
                />
                <Select value={ovEffect} onValueChange={(v) => setOvEffect((v ?? "DENY") as "ALLOW" | "DENY")}>
                  <SelectTrigger className="bg-white dark:bg-slate-950 w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALLOW">ALLOW</SelectItem>
                    <SelectItem value="DENY">DENY</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                value={ovReason}
                onChange={(e) => setOvReason(e.target.value)}
                rows={1}
                placeholder="Why this override? (audit note)"
                className="bg-white dark:bg-slate-950 text-xs"
              />
              <Button size="sm" disabled={isPending} onClick={handleAddOverride}>
                <Plus className="h-4 w-4 mr-1" /> Add Override
              </Button>
            </div>
          )}
        </div>

        {/* ── 3. Effective Permissions Preview ──────────────────────────── */}
        <div>
          <button
            className="w-full flex items-center justify-between text-left mb-2"
            onClick={() => setPreviewOpen((v) => !v)}
          >
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
              Effective Permissions ({isSuper ? "ALL" : grantedSet.size})
            </p>
            {previewOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
          </button>
          {previewOpen && (
            isSuper ? (
              <p className="text-sm text-slate-500">Super Admin — every page, tab, and action is accessible.</p>
            ) : grantedSet.size === 0 ? (
              <p className="text-sm text-slate-500">This user has no granted permissions.</p>
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/60 max-h-80 overflow-y-auto">
                {MENU_GROUP_TITLES.map((g) => {
                  const pages = groupVisiblePages(g)
                  if (pages.length === 0) return null
                  const open = expandedGroups.has(g)
                  return (
                    <div key={g}>
                      <button className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => toggleGroup(g)}>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{g}</span>
                        <span className="text-[10px] text-slate-400">{pages.length} pages · {open ? <ChevronDown className="inline h-3 w-3" /> : <ChevronRight className="inline h-3 w-3" />}</span>
                      </button>
                      {open && (
                        <div className="px-3 pb-2 pl-6 flex flex-wrap gap-1.5">
                          {pages.map((p) => (
                            <Badge key={p} variant="outline" className="text-[10px] font-normal text-slate-500">{p}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Rebuild the "::"-separated key from a permission row for display.
function permToKey(p: { menuGroup: string; page: string; tab: string; action: string }): string {
  return p.action !== ""
    ? `${p.menuGroup}::${p.page}::${p.tab}::${p.action}`
    : p.tab !== ""
      ? `${p.menuGroup}::${p.page}::${p.tab}`
      : p.page !== ""
        ? `${p.menuGroup}::${p.page}`
        : p.menuGroup
}
