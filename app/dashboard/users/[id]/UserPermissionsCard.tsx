"use client"

// ============================================================================
// UserPermissionsCard — the "Permissions" section on a user's detail page.
//
// TWO MODES — admin picks one at the top via a segmented control:
//
//   MODE 1 — "Role-Based" (recommended for groups of same-type users)
//     Assign predefined roles (Treasurer, Auditor, Cashier, etc.). The user
//     inherits every permission the role defines. Use this when multiple
//     users share the same access profile — assign the role once, reuse for
//     every user of that type.
//
//   MODE 2 — "Direct Permissions" (for individual fine-tuning)
//     Grant specific permissions directly to THIS user, without a role.
//     Pick a Module → Page → Action from a hierarchical picker. The grant
//     is stored as an ALLOW override — independent of any role.
//
// Both modes can coexist on the same user:
//   - Assign "Treasurer" role (MODE 1) → user gets all treasurer permissions
//   - Add a DIRECT "approve_loan" permission (MODE 2) → user can also approve loans
//   - Add a DIRECT DENY on "approve_withdrawal" (MODE 2) → user can NOT approve withdrawals
//
// The "Effective Permissions" preview at the bottom shows the combined result
// of roles + direct permissions — what the user can ACTUALLY access.
//
// ── Why two modes? ──────────────────────────────────────────────────────────
// The previous UI mixed roles + overrides in one long panel, making it
// unclear which path to use. The two-mode toggle makes the admin's intent
// explicit:
//   "I want to set up a typical cashier" → MODE 1 → pick "Treasurer / Cashier"
//   "I want to give John one extra permission" → MODE 2 → pick the specific action
//
// Both modes ultimately write to the same underlying RBAC tables (UserRole +
// UserPermissionOverride), so the backend enforcement is identical.

import { useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import {
  ShieldCheck, Plus, X, ChevronDown, ChevronRight, Lock,
  Users, User, CheckCircle2, XCircle, Info,
} from "lucide-react"
import {
  MENU_GROUP_TITLES,
  pagesOf,
  pageDef,
  type MenuGroupKey,
} from "@/lib/permissions/permission-registry"
import { safeFetch } from "@/lib/safe-fetch"

// ── Types ──────────────────────────────────────────────────────────────────
interface AssignedRole {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  isSuperAdmin: boolean
  assignedAt: string
}
interface DirectPermission {
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
  overrides: DirectPermission[]
  effectiveKeys: string[]
  allRoles: SelectableRole[]
  canManage: boolean
}

type PermissionMode = "role-based" | "direct"

export default function UserPermissionsCard({
  userId, assignedRoles, overrides, effectiveKeys, allRoles, canManage,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // ── Mode toggle state ─────────────────────────────────────────────────
  // Defaults to "role-based" — the most common admin action.
  // If the user already has direct permissions but no roles, defaults to "direct"
  // so the admin sees the existing setup.
  const [mode, setMode] = useState<PermissionMode>(
    assignedRoles.length === 0 && overrides.length > 0 ? "direct" : "role-based"
  )

  // ── Role assignment state ─────────────────────────────────────────────
  const [addRoleId, setAddRoleId] = useState("")

  // ── Direct permission picker state (Module → Page → Actions[]) ─────
  // Multi-select: the admin can check multiple actions and grant/deny
  // them all at once — same UX as the role permission matrix.
  // `dpIncludeView` — when checked, grants page-level "view" access too,
  // so the user can open the page. (Action grants also imply view via the
  // bottom-up inheritance in permissionGranted(), but this lets you grant
  // VIEW ONLY without any actions.)
  const [dpModule, setDpModule] = useState<string>("")
  const [dpPage, setDpPage] = useState<string>("")
  const [dpIncludeView, setDpIncludeView] = useState<boolean>(false)
  const [dpActions, setDpActions] = useState<Set<string>>(new Set())
  const [dpEffect, setDpEffect] = useState<"ALLOW" | "DENY">("ALLOW")
  const [dpReason, setDpReason] = useState("")

  // ── Effective-preview expansion ───────────────────────────────────────
  const [previewOpen, setPreviewOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const isSuper = assignedRoles.some((r) => r.isSuperAdmin)
  const grantedSet = new Set(effectiveKeys)

  // Roles the user doesn't yet have (for the add dropdown).
  const assignableRoles = allRoles.filter(
    (r) => !assignedRoles.some((ar) => ar.id === r.id)
  )

  // ── Hierarchical picker: available pages + actions based on selections ──
  const availablePages = useMemo(() => {
    if (!dpModule) return []
    return pagesOf(dpModule as MenuGroupKey)
  }, [dpModule])

  const availableActions = useMemo(() => {
    if (!dpModule || !dpPage) return []
    const def = pageDef(dpModule as MenuGroupKey, dpPage)
    // Exclude "view" from the grid — it has its own dedicated checkbox at the top
    return (def?.actions ?? []).filter((a) => a !== "view")
  }, [dpModule, dpPage])

  // ── Pre-populate checkboxes from the user's existing permissions ──────
  // When the admin picks a page, we check which actions the user ALREADY
  // has granted and pre-check those boxes.
  //
  // CRITICAL: We distinguish between ROLE-granted permissions and DIRECT
  // OVERRIDE-granted permissions:
  //
  //   - If a ROLE grants the page key → ALL actions are checked (the role
  //     genuinely grants them all via top-down inheritance).
  //
  //   - If a DIRECT OVERRIDE grants the page key → we do NOT check all
  //     actions. Why: old buggy code stored the page key when the admin
  //     only wanted view access. We only check actions that have their
  //     OWN action-level key in the granted set.
  //
  //   - If only the `view` action is granted → only "View Page" is checked,
  //     all actions unchecked. This is the correct view-only state.
  //
  // We detect whether the page key came from a role vs. a direct override
  // by checking the `overrides` array — if the page key appears there as
  // an ALLOW override, it's a direct grant (possibly from the old bug).
  const syncCheckboxesFromExisting = (module: string, page: string) => {
    if (!module || !page) {
      setDpActions(new Set())
      setDpIncludeView(false)
      return
    }

    const pageKey = `${module}::${page}`
    const groupKey = module
    const viewActionKey = `${module}::${page}::::view`

    // Check if the page key is a DIRECT OVERRIDE (from the overrides array).
    // If so, it was stored by the old buggy code and should NOT cause all
    // actions to be checked.
    const pageKeyIsDirectOverride = overrides.some(
      (o) => o.effect === "ALLOW" &&
      o.permission.menuGroup === module &&
      o.permission.page === page &&
      o.permission.tab === "" &&
      o.permission.action === "" // page-level key has empty action
    )

    // Check if the page key is from a ROLE (in effectiveKeys but NOT a
    // direct override). If so, ALL actions are genuinely granted.
    const pageKeyFromRole =
      grantedSet.has(pageKey) && !pageKeyIsDirectOverride

    // Check if the group key is from a ROLE (not a direct override).
    const groupKeyFromRole =
      grantedSet.has(groupKey) &&
      !overrides.some(
        (o) => o.effect === "ALLOW" &&
        o.permission.menuGroup === module &&
        o.permission.page === "" &&
        o.permission.tab === "" &&
        o.permission.action === ""
      )

    // "View Page" checkbox: checked if the user can access the page at all.
    const hasView =
      grantedSet.has(viewActionKey) ||     // view action explicitly granted
      grantedSet.has(pageKey) ||            // page key granted (role or override)
      grantedSet.has(groupKey) ||            // group key granted (role)
      Array.from(grantedSet).some((k) => k.startsWith(`${pageKey}::`)) // any action → view
    setDpIncludeView(hasView)

    // Action checkboxes: check ONLY if the specific action key is in the
    // granted set, OR if the page/group key came from a ROLE (not a direct
    // override). This prevents old buggy page-level overrides from causing
    // all actions to appear checked.
    const def = pageDef(module as MenuGroupKey, page)
    const actions = (def?.actions ?? []).filter((a) => a !== "view")
    const checked = new Set<string>()
    for (const action of actions) {
      const actionKey = `${module}::${page}::::${action}`
      if (
        grantedSet.has(actionKey) ||  // specific action key is granted
        pageKeyFromRole ||             // role grants the page → all actions
        groupKeyFromRole                // role grants the group → everything
      ) {
        checked.add(action)
      }
    }
    setDpActions(checked)
  }

  // Reset downstream selections when upstream changes.
  const handleModuleChange = (v: string | null) => {
    setDpModule(v ?? ""); setDpPage(""); setDpActions(new Set()); setDpIncludeView(false)
  }
  const handlePageChange = (v: string | null) => {
    const page = v ?? ""
    setDpPage(page)
    // Pre-populate checkboxes from the user's existing permissions
    syncCheckboxesFromExisting(dpModule, page)
  }

  // Toggle a single action checkbox.
  const toggleAction = (action: string) => {
    setDpActions((prev) => {
      const next = new Set(prev)
      if (next.has(action)) next.delete(action)
      else next.add(action)
      return next
    })
  }

  // Select / deselect all actions for the current page.
  const selectAllActions = () => {
    setDpActions(new Set(availableActions))
  }
  const deselectAllActions = () => {
    setDpActions(new Set())
  }

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

  // ── Direct permission actions ──────────────────────────────────────────
  const handleAddDirectPermissions = () => {
    if (!dpModule || !dpPage) {
      toast.error("Pick a module and page.")
      return
    }
    if (!dpIncludeView && dpActions.size === 0) {
      toast.error("Check 'View Page' or select at least one action.")
      return
    }

    // Collect all permission keys to grant/deny.
    // If "View Page" is checked, send the `view` ACTION key (NOT the page key).
    // Why: the page key grants ALL actions via top-down inheritance, but
    // "View Page" should be view-ONLY. The `view` action grants page access
    // via bottom-up inheritance (action → page) WITHOUT granting other actions.
    const keys: string[] = []
    if (dpIncludeView) {
      keys.push(`${dpModule}::${dpPage}::::view`) // view action (view-only)
    }
    for (const action of dpActions) {
      keys.push(`${dpModule}::${dpPage}::::${action}`) // action-level
    }

    const reason = dpReason.trim() || null

    startTransition(async () => {
      let success = 0
      let failed = 0
      let firstError = ""

      for (const permKey of keys) {
        const r = await safeFetch(`/api/permissions/users/${userId}/overrides`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            permissionKey: permKey,
            effect: dpEffect,
            reason,
          }),
        })
        if (r.ok) {
          success++
        } else {
          failed++
          if (!firstError) firstError = r.title
        }
      }

      const total = keys.length
      if (success > 0 && failed === 0) {
        toast.success(
          `${dpEffect === "ALLOW" ? "Granted" : "Denied"} ${success} permission${success === 1 ? "" : "s"}`,
          { description: `${dpModule} → ${dpPage}` }
        )
      } else if (success > 0 && failed > 0) {
        toast.warning(
          `${success} of ${total} applied, ${failed} failed`,
          { description: firstError || "Some permissions could not be applied." }
        )
      } else {
        toast.error("Failed to add permissions", { description: firstError })
      }

      // Reset the picker
      setDpActions(new Set())
      setDpIncludeView(false)
      setDpReason("")
      router.refresh()
    })
  }

  const handleRemoveDirectPermission = (permId: string) => {
    startTransition(async () => {
      const r = await safeFetch(`/api/permissions/users/${userId}/overrides/${permId}`, { method: "DELETE" })
      if (!r.ok) { toast.error(r.title, { description: r.description }); return }
      toast.success("Direct permission removed")
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
          <ShieldCheck className="h-4 w-4 text-indigo-500" /> Permissions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {isSuper && (
          <div className="text-sm text-slate-600 dark:text-slate-300 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800">
            <ShieldCheck className="inline h-4 w-4 mr-1 text-indigo-500" />
            This user is a <strong>Super Admin</strong> — full unrestricted access to every module and action.
            Role assignments and direct permissions below do not apply.
          </div>
        )}

        {/* ── MODE TOGGLE — the key UX change ────────────────────────────── */}
        {!isSuper && canManage && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              How do you want to set up this user&apos;s permissions?
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Mode 1: Role-Based */}
              <button
                type="button"
                onClick={() => setMode("role-based")}
                className={`text-left rounded-lg border-2 p-3 transition-all ${
                  mode === "role-based"
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                    : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Users className={`h-4 w-4 ${mode === "role-based" ? "text-indigo-500" : "text-slate-400"}`} />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Role-Based
                  </span>
                  {mode === "role-based" && (
                    <CheckCircle2 className="h-4 w-4 text-indigo-500 ml-auto" />
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  Assign a predefined role (Treasurer, Auditor, etc.). Best when multiple
                  users share the same access profile.
                </p>
              </button>

              {/* Mode 2: Direct Permissions */}
              <button
                type="button"
                onClick={() => setMode("direct")}
                className={`text-left rounded-lg border-2 p-3 transition-all ${
                  mode === "direct"
                    ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
                    : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <User className={`h-4 w-4 ${mode === "direct" ? "text-amber-500" : "text-slate-400"}`} />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Direct Permissions
                  </span>
                  {mode === "direct" && (
                    <CheckCircle2 className="h-4 w-4 text-amber-500 ml-auto" />
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  Grant specific permissions to THIS user only. Best for unique
                  access needs that don&apos;t fit a standard role.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* ── MODE 1: ROLE-BASED ─────────────────────────────────────────── */}
        {(mode === "role-based" || !canManage || isSuper) && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-500" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Assigned Roles
              </p>
              {assignedRoles.length > 0 && (
                <Badge variant="outline" className="text-[10px] ml-auto">
                  {assignedRoles.length} role{assignedRoles.length === 1 ? "" : "s"}
                </Badge>
              )}
            </div>

            {assignedRoles.length === 0 ? (
              <p className="text-sm text-slate-400 italic py-2">
                No roles assigned. Pick a role below to grant a bundle of permissions.
              </p>
            ) : (
              <div className="space-y-2">
                {assignedRoles.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 bg-white dark:bg-slate-950">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{r.name}</span>
                      {r.isSystem && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Lock className="h-2.5 w-2.5" /> system
                        </Badge>
                      )}
                      {r.description && (
                        <span className="text-xs text-slate-400 truncate hidden sm:inline">— {r.description}</span>
                      )}
                    </div>
                    {canManage && !r.isSuperAdmin && (
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 h-7" disabled={isPending} onClick={() => handleRevokeRole(r.id, r.name)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {canManage && assignableRoles.length > 0 && !isSuper && (
              <div className="flex gap-2">
                <Select value={addRoleId} onValueChange={(v) => setAddRoleId(v ?? "")}>
                  <SelectTrigger className="bg-white dark:bg-slate-950 flex-1">
                    <SelectValue placeholder="Choose a role to assign…" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}{r.isSuperAdmin ? " (super admin)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" disabled={isPending} onClick={handleAssignRole}>
                  <Plus className="h-4 w-4 mr-1" /> Assign
                </Button>
              </div>
            )}

            {/* Switch-to-direct hint when no direct perms exist yet */}
            {canManage && !isSuper && overrides.length === 0 && mode === "role-based" && (
              <p className="text-[11px] text-slate-400 italic">
                Need to grant one specific permission without a role? Switch to{" "}
                <button
                  type="button"
                  className="text-amber-600 dark:text-amber-400 underline hover:no-underline"
                  onClick={() => setMode("direct")}
                >
                  Direct Permissions
                </button>{" "}
                above.
              </p>
            )}
          </div>
        )}

        {/* ── MODE 2: DIRECT PERMISSIONS ─────────────────────────────────── */}
        {(mode === "direct" || overrides.length > 0) && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-amber-500" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Direct Permissions
              </p>
              {overrides.length > 0 && (
                <Badge variant="outline" className="text-[10px] ml-auto">
                  {overrides.length} direct grant{overrides.length === 1 ? "" : "s"}
                </Badge>
              )}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 -mt-1">
              Grant or deny SPECIFIC permissions to this user, independent of any role.
              Pick a module, page, and action below.
            </p>

            {/* Existing direct permissions */}
            {overrides.length > 0 && (
              <div className="space-y-2">
                {overrides.map((o) => {
                  // Detect old-style page-level grants (no action specified).
                  // These were stored by the old buggy code and grant ALL
                  // actions via top-down inheritance. Flag them so the admin
                  // knows to remove them.
                  const isOldPageGrant =
                    o.effect === "ALLOW" &&
                    o.permission.action === "" &&
                    o.permission.tab === "" &&
                    o.permission.page !== ""
                  return (
                  <div key={o.id} className={`flex items-start justify-between gap-2 rounded-lg border px-3 py-2 bg-white dark:bg-slate-950 ${
                    isOldPageGrant ? "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20" : "border-slate-200 dark:border-slate-800"
                  }`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {o.effect === "ALLOW" ? (
                          <Badge className="text-[10px] gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">
                            <CheckCircle2 className="h-2.5 w-2.5" /> GRANT
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px] gap-1">
                            <XCircle className="h-2.5 w-2.5" /> DENY
                          </Badge>
                        )}
                        <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                          {o.permission.menuGroup}
                        </span>
                        <span className="text-xs text-slate-400">→</span>
                        <span className="text-xs text-slate-600 dark:text-slate-300">
                          {o.permission.page}
                        </span>
                        {o.permission.action ? (
                          <>
                            <span className="text-xs text-slate-400">→</span>
                            <code className="text-[11px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded">
                              {o.permission.action.replace(/_/g, " ")}
                            </code>
                          </>
                        ) : isOldPageGrant ? (
                          <Badge className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200">
                            FULL PAGE ACCESS — grants all actions
                          </Badge>
                        ) : null}
                      </div>
                      {o.reason && (
                        <p className="text-[11px] text-slate-400 mt-1 italic">&ldquo;{o.reason}&rdquo;</p>
                      )}
                    </div>
                    {canManage && (
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 h-7 shrink-0" disabled={isPending} onClick={() => handleRemoveDirectPermission(o.permission.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  )
                })}
              </div>
            )}

            {/* Add new direct permission — hierarchical picker */}
            {canManage && !isSuper && mode === "direct" && (
              <div className="space-y-3 rounded-lg border border-dashed border-amber-300 dark:border-amber-700 p-4 bg-amber-50/30 dark:bg-amber-950/10">
                <p className="text-[11px] uppercase tracking-wider font-bold text-amber-600 dark:text-amber-400">
                  Add a Direct Permission
                </p>

                {/* Module → Page picker, then checkbox list for actions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-slate-400">Module</Label>
                    <Select value={dpModule} onValueChange={handleModuleChange}>
                      <SelectTrigger className="bg-white dark:bg-slate-950">
                        <SelectValue placeholder="Select module…" />
                      </SelectTrigger>
                      <SelectContent>
                        {MENU_GROUP_TITLES.map((g) => (
                          <SelectItem key={g} value={g}>{g}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-slate-400">Page</Label>
                    <Select value={dpPage} onValueChange={handlePageChange} disabled={!dpModule}>
                      <SelectTrigger className="bg-white dark:bg-slate-950">
                        <SelectValue placeholder={dpModule ? "Select page…" : "Pick module first"} />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePages.map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* View Page checkbox + Action checkboxes — multi-select */}
                {dpPage && (
                  <div className="space-y-2">
                    {/* "View Page" — grants page-level access (so the user can open the page) */}
                    <label
                      className={`flex items-center gap-2 text-xs font-medium cursor-pointer rounded-md px-2 py-1.5 border ${
                        dpIncludeView
                          ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                          : "bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={dpIncludeView}
                        onChange={(e) => setDpIncludeView(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className={dpIncludeView ? "text-emerald-700 dark:text-emerald-300" : "text-slate-600 dark:text-slate-300"}>
                        View Page (can open & view this page)
                      </span>
                      <span className="text-[10px] ml-auto">
                        {dpIncludeView ? (
                          <span className="text-emerald-600 dark:text-emerald-400">✓ granted</span>
                        ) : (
                          <span className="text-slate-400">not permitted</span>
                        )}
                      </span>
                    </label>

                    {/* Action checkboxes — only show if the page has actions */}
                    {availableActions.length > 0 && (
                      <>
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] uppercase text-slate-400">
                            Actions ({dpActions.size} of {availableActions.length} granted)
                          </Label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={selectAllActions}
                              className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              Select All
                            </button>
                            <span className="text-slate-300">·</span>
                            <button
                              type="button"
                              onClick={deselectAllActions}
                              className="text-[10px] text-slate-500 hover:underline"
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800 p-2 bg-white dark:bg-slate-950">
                          {availableActions.map((action) => {
                            const isGranted = dpActions.has(action)
                            return (
                              <label
                                key={action}
                                className={`flex items-center gap-1.5 text-xs cursor-pointer rounded px-1.5 py-1 transition-colors ${
                                  isGranted
                                    ? "bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                                    : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isGranted}
                                  onChange={() => toggleAction(action)}
                                  className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                />
                                <span className={isGranted ? "text-emerald-700 dark:text-emerald-300 font-medium" : "text-slate-500 dark:text-slate-400"}>
                                  {action.replace(/_/g, " ")}
                                </span>
                                {isGranted && (
                                  <span className="ml-auto text-[9px] text-emerald-500">✓</span>
                                )}
                              </label>
                            )
                          })}
                        </div>
                        <p className="text-[10px] text-slate-400 italic">
                          Checked = already granted (via role or direct permission).
                          Unchecked = not permitted. Toggle to add/remove.
                          Use &ldquo;Select All&rdquo; to grant every action at once.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {/* Effect: GRANT or DENY */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-slate-400">Effect</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={dpEffect === "ALLOW" ? "default" : "outline"}
                      className={dpEffect === "ALLOW" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
                      onClick={() => setDpEffect("ALLOW")}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> GRANT this permission
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={dpEffect === "DENY" ? "default" : "outline"}
                      className={dpEffect === "DENY" ? "bg-red-600 hover:bg-red-700 text-white" : ""}
                      onClick={() => setDpEffect("DENY")}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" /> DENY this permission
                    </Button>
                  </div>
                </div>

                {/* Reason */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-slate-400">Reason (optional, for audit log)</Label>
                  <input
                    type="text"
                    value={dpReason}
                    onChange={(e) => setDpReason(e.target.value)}
                    placeholder="e.g. Temporary approval permission during manager's leave"
                    className="w-full bg-white dark:bg-slate-950 text-xs rounded-md border border-slate-200 dark:border-slate-800 px-3 py-2"
                  />
                </div>

                {/* Preview the permissions being granted */}
                {dpModule && dpPage && (dpIncludeView || dpActions.size > 0) && (
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 rounded p-2 border border-slate-200 dark:border-slate-700">
                    <Info className="inline h-3 w-3 mr-1" />
                    This will <strong>{dpEffect === "ALLOW" ? "GRANT" : "DENY"}</strong>{" "}
                    <strong>{(dpIncludeView ? 1 : 0) + dpActions.size}</strong> permission{((dpIncludeView ? 1 : 0) + dpActions.size) === 1 ? "" : "s"}:
                    <code className="ml-1 text-indigo-600 dark:text-indigo-400 font-mono">
                      {dpIncludeView && "View Page"}
                      {dpIncludeView && dpActions.size > 0 && ", "}
                      {Array.from(dpActions).map(a => a.replace(/_/g, " ")).join(", ")}
                    </code>
                  </div>
                )}

                <Button
                  size="sm"
                  disabled={isPending || !dpModule || !dpPage || (!dpIncludeView && dpActions.size === 0)}
                  onClick={handleAddDirectPermissions}
                  className={dpEffect === "ALLOW"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-red-600 hover:bg-red-700 text-white"
                  }
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {dpEffect === "ALLOW"
                    ? `Grant ${(dpIncludeView ? 1 : 0) + (dpActions.size || 0)} Permission${((dpIncludeView ? 1 : 0) + dpActions.size) === 1 ? "" : "s"}`
                    : `Deny ${(dpIncludeView ? 1 : 0) + (dpActions.size || 0)} Permission${((dpIncludeView ? 1 : 0) + dpActions.size) === 1 ? "" : "s"}`
                  }
                </Button>
              </div>
            )}

            {/* Switch-to-role hint when no roles exist yet */}
            {canManage && !isSuper && assignedRoles.length === 0 && mode === "direct" && (
              <p className="text-[11px] text-slate-400 italic">
                Want to grant a whole bundle of permissions at once? Switch to{" "}
                <button
                  type="button"
                  className="text-indigo-600 dark:text-indigo-400 underline hover:no-underline"
                  onClick={() => setMode("role-based")}
                >
                  Role-Based
                </button>{" "}
                above.
              </p>
            )}
          </div>
        )}

        {/* ── Divider ─────────────────────────────────────────────────────── */}
        <div className="border-t border-slate-200 dark:border-slate-800" />

        {/* ── EFFECTIVE PERMISSIONS PREVIEW ───────────────────────────────── */}
        <div>
          <button
            className="w-full flex items-center justify-between text-left mb-2"
            onClick={() => setPreviewOpen((v) => !v)}
          >
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              Effective Permissions
            </p>
            {previewOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400 -mt-1 mb-2">
            Read-only preview of what this user can ACTUALLY access — combined result of
            roles + direct permissions.
            {isSuper
              ? " Super Admin has access to everything."
              : ` ${grantedSet.size} permission${grantedSet.size === 1 ? "" : "s"} granted.`
            }
          </p>
          {previewOpen && (
            isSuper ? (
              <p className="text-sm text-slate-500 bg-emerald-50 dark:bg-emerald-950/30 rounded p-3">
                <ShieldCheck className="inline h-4 w-4 mr-1 text-emerald-500" />
                Super Admin — every page, tab, and action is accessible.
              </p>
            ) : grantedSet.size === 0 ? (
              <p className="text-sm text-slate-400 italic py-2">
                This user has no granted permissions. Assign a role or grant a direct permission above.
              </p>
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
