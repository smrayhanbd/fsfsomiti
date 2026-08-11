"use client"

// ============================================================================
// PERMISSION MATRIX — full-page editor for one role's permission set.
// ============================================================================
// Left rail: the 6 menu groups as a list. Selecting one shows its pages in the
// right panel. Each page renders its tabs and actions as a grid of toggle
// chips. "Select all" toggles every key on the current page.
//
// The checked state is held in a single Set<string> of granted keys; toggling
// adds/removes the leaf key. Because the resolver applies inheritance, checking
// a page-level or group-level "select all" is implemented by adding the leaf
// keys (so the visual reflects exactly what the role grants — no implicit
// inheritance surprises in the editor).

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { ArrowLeft, Save, CheckCheck, X } from "lucide-react"
import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"
import {
  PERMISSION_REGISTRY,
  MENU_GROUP_TITLES,
  groupKey,
  pageKey,
  tabKey,
  actionKey,
  type MenuGroupKey,
} from "@/lib/permissions/permission-registry"
import { safeFetch } from "@/lib/safe-fetch"

interface Props {
  role: { id: string; name: string; description: string | null; isSystem: boolean }
  initialGrantedKeys: string[]
}

export default function PermissionMatrixClient({ role, initialGrantedKeys }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [granted, setGranted] = useState<Set<string>>(() => new Set(initialGrantedKeys))
  const [activeGroup, setActiveGroup] = useState<MenuGroupKey>(MENU_GROUP_TITLES[0])

  // Dirty state = differs from the originally-loaded set.
  const dirty = useMemo(() => {
    if (granted.size !== initialGrantedKeys.length) return true
    for (const k of granted) if (!initialGrantedKeys.includes(k)) return true
    return false
  }, [granted, initialGrantedKeys])

  const toggle = (key: string) => {
    setGranted((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Every leaf key on the current page: all tabs + all actions.
  const pageKeys = (group: MenuGroupKey, page: string): string[] => {
    const def = (PERMISSION_REGISTRY[group] as Record<string, { tabs: string[]; actions: string[] }>)[page]
    if (!def) return []
    const keys = [
      pageKey(group, page),
      ...def.tabs.map((t) => tabKey(group, page, t)),
      ...def.actions.map((a) => actionKey(group, page, a)),
    ]
    return keys
  }

  const allPageKeysChecked = (group: MenuGroupKey, page: string): boolean =>
    pageKeys(group, page).every((k) => granted.has(k))

  const togglePageAll = (group: MenuGroupKey, page: string) => {
    const keys = pageKeys(group, page)
    const allOn = keys.every((k) => granted.has(k))
    setGranted((prev) => {
      const next = new Set(prev)
      if (allOn) keys.forEach((k) => next.delete(k))
      else keys.forEach((k) => next.add(k))
      return next
    })
  }

  // Every leaf key in a group: group + all pages/tabs/actions.
  const groupKeys = (group: MenuGroupKey): string[] => {
    const keys = [groupKey(group)]
    for (const page of Object.keys(PERMISSION_REGISTRY[group])) {
      keys.push(...pageKeys(group, page))
    }
    return keys
  }
  const allGroupKeysChecked = (group: MenuGroupKey): boolean =>
    groupKeys(group).every((k) => granted.has(k))
  const toggleGroupAll = (group: MenuGroupKey) => {
    const keys = groupKeys(group)
    const allOn = keys.every((k) => granted.has(k))
    setGranted((prev) => {
      const next = new Set(prev)
      if (allOn) keys.forEach((k) => next.delete(k))
      else keys.forEach((k) => next.add(k))
      return next
    })
  }

  const handleSave = () => {
    startTransition(async () => {
      const r = await safeFetch<{ roleId: string; grantedCount: number }>(
        `/api/permissions/roles/${role.id}/permissions`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permissionKeys: Array.from(granted) }),
        },
      )
      if (!r.ok) { toast.error(r.title, { description: r.description }); return }
      toast.success("Permissions updated", { description: `${r.data.grantedCount} keys` })
      router.refresh()
    })
  }

  const activePages = Object.keys(PERMISSION_REGISTRY[activeGroup]) as string[]

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={`Permissions · ${role.name}`}
        subtitle={role.description ?? "Edit which pages, tabs, and actions this role grants"}
        actions={
          <div className="flex gap-2">
            <Link href="/dashboard/permissions/roles"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Roles</Button></Link>
            <Button className="brand-gradient shadow-brand-glow" disabled={!dirty || isPending} onClick={handleSave}>
              {isPending ? "Saving…" : <><Save className="mr-2 h-4 w-4" /> Save Changes</>}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Left rail — menu groups */}
        <div className="lg:col-span-1">
          <SectionCard title="Menu Groups" accent="violet" bodyClassName="p-2">
            <div className="space-y-1">
              {MENU_GROUP_TITLES.map((g) => {
                const count = groupKeys(g).filter((k) => granted.has(k)).length
                const total = groupKeys(g).length
                return (
                  <button
                    key={g}
                    onClick={() => setActiveGroup(g)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      activeGroup === g
                        ? "bg-brand-gradient-soft text-brand"
                        : "text-secondary-ink hover:bg-subtle"
                    }`}
                  >
                    <span className="font-medium">{g}</span>
                    <span className="t-caption text-muted-ink">{count}/{total}</span>
                  </button>
                )
              })}
            </div>
          </SectionCard>
        </div>

        {/* Right panel — pages, tabs, actions for the active group */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-[var(--border-base)] bg-subtle/40 px-4 py-3">
            <div>
              <p className="t-body font-semibold text-primary-ink">{activeGroup}</p>
              <p className="t-caption text-muted-ink">{activePages.length} pages in this group</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => toggleGroupAll(activeGroup)}>
              {allGroupKeysChecked(activeGroup) ? <><X className="mr-1.5 h-3.5 w-3.5" /> Clear all</> : <><CheckCheck className="mr-1.5 h-3.5 w-3.5" /> Select all</>}
            </Button>
          </div>

          {activePages.map((page) => {
            const def = (PERMISSION_REGISTRY[activeGroup] as Record<string, { tabs: string[]; actions: string[] }>)[page]
            if (!def) return null
            const allOn = allPageKeysChecked(activeGroup, page)
            return (
              <SectionCard key={page} title={page} accent="blue" bodyClassName="p-4"
                action={
                  <Button variant="ghost" size="sm" onClick={() => togglePageAll(activeGroup, page)}>
                    {allOn ? "Clear page" : "Select all"}
                  </Button>
                }
              >
                <div className="space-y-3">
                  {/* Tabs */}
                  {def.tabs.length > 0 && (
                    <div>
                      <p className="t-overline mb-1.5 text-muted-ink">Tabs</p>
                      <div className="flex flex-wrap gap-2">
                        {def.tabs.map((t) => {
                          const k = tabKey(activeGroup, page, t)
                          const on = granted.has(k)
                          return (
                            <button key={t} onClick={() => toggle(k)}
                              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                on
                                  ? "border-brand bg-brand-gradient-soft text-brand"
                                  : "border-[var(--border-base)] text-muted-ink hover:bg-subtle"
                              }`}>
                              {t}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {/* Actions */}
                  {def.actions.length > 0 && (
                    <div>
                      <p className="t-overline mb-1.5 text-muted-ink">Actions</p>
                      <div className="flex flex-wrap gap-2">
                        {def.actions.map((a) => {
                          const k = actionKey(activeGroup, page, a)
                          const on = granted.has(k)
                          return (
                            <button key={a} onClick={() => toggle(k)}
                              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                on
                                  ? "border-brand bg-brand-gradient-soft text-brand"
                                  : "border-[var(--border-base)] text-muted-ink hover:bg-subtle"
                              }`}>
                              {a.replace(/_/g, " ")}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </SectionCard>
            )
          })}
        </div>
      </div>
    </div>
  )
}
