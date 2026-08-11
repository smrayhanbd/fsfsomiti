"use client"

// ============================================================================
// PERMISSION GATES — declarative JSX guards for Client Components.
// ============================================================================
// Each gate renders its children only if the user holds the required
// permission (with full inheritance: group → page → tab → action). When the
// check fails, the `fallback` prop is rendered instead (defaults to null, so
// the element simply disappears).
//
// All checks go through usePermissions() → the same inheritance logic the
// server uses, so a button hidden client-side is also enforced server-side.
//
//   <PermissionGate group="Finance & Accounting" page="Loan Management" action="approve_loan">
//     <ApproveButton />
//   </PermissionGate>
//
//   <PermissionGate group="..." page="..." tab="pending" fallback={<LockedTab/>}>
//     <PendingLoansTab />
//   </PermissionGate>

import type { ReactNode } from "react"
import { usePermissions } from "@/lib/permissions/client"

interface CommonGateProps {
  /** When the permission is missing, render this instead. Default: nothing. */
  fallback?: ReactNode
  children: ReactNode
}

interface ActionGateProps extends CommonGateProps {
  menuGroup: string
  page: string
  action: string
  /** Scope the action to a specific tab (optional). */
  tab?: string
}

interface PageGateProps extends CommonGateProps {
  menuGroup: string
  page: string
}

interface TabGateProps extends CommonGateProps {
  menuGroup: string
  page: string
  tab: string
}

interface GroupGateProps extends CommonGateProps {
  menuGroup: string
}

// ── Action-level gate (buttons / features) ───────────────────────────────
export function PermissionGate({
  menuGroup,
  page,
  action,
  tab,
  fallback = null,
  children,
}: ActionGateProps) {
  const { canDoAction } = usePermissions()
  return <>{canDoAction(menuGroup, page, action, tab) ? children : fallback}</>
}

// ── Page-level gate ──────────────────────────────────────────────────────
export function PagePermissionGate({
  menuGroup,
  page,
  fallback = null,
  children,
}: PageGateProps) {
  const { canAccessPage } = usePermissions()
  return <>{canAccessPage(menuGroup, page) ? children : fallback}</>
}

// ── Tab-level gate ───────────────────────────────────────────────────────
export function TabPermissionGate({
  menuGroup,
  page,
  tab,
  fallback = null,
  children,
}: TabGateProps) {
  const { canAccessTab } = usePermissions()
  return <>{canAccessTab(menuGroup, page, tab) ? children : fallback}</>
}

// ── Group-level gate (rarely needed; the sidebar handles group visibility) ─
export function GroupPermissionGate({
  menuGroup,
  fallback = null,
  children,
}: GroupGateProps) {
  const { canAccessGroup } = usePermissions()
  return <>{canAccessGroup(menuGroup) ? children : fallback}</>
}

// ── Raw-key gate (advanced — when you already hold a built key) ───────────
export function PermissionKeyGate({
  k,
  fallback = null,
  children,
}: { k: string; fallback?: ReactNode; children: ReactNode }) {
  const { can } = usePermissions()
  return <>{can(k) ? children : fallback}</>
}
