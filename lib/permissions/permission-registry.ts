// ============================================================================
// PERMISSION REGISTRY — the single source of truth for the RBAC hierarchy.
// ============================================================================
// This file mirrors SIDEBAR_MENU_GROUPS in components/AppSidebar.tsx exactly:
// every menu group, every page (NavItems), and every subItem (accordion child)
// is represented here as a node in the 4-level permission hierarchy:
//
//   menuGroup  →  page  →  tab?  →  action?
//
// Downstream consumers:
//   • prisma/seed-permissions.ts  — enumerates every key → Permission rows
//   • lib/permissions/resolver.ts — resolves a user's effective key Set
//   • the permission-matrix UI    — renders toggles from this structure
//
// PERMISSION KEY FORMAT (use "::" as a segment separator):
//   Group only : "Finance & Accounting"
//   Page       : "Finance & Accounting::Loan Management"
//   Tab        : "Finance & Accounting::Loan Management::pending"
//   Action     : "Finance & Accounting::Loan Management::::approve_loan"
//                (4 segments; empty string for `tab` when the action applies
//                 to the whole page, not a specific tab)
//
// SubItems of an accordion parent are each treated as their OWN page (they
// have distinct routes), and ACCORDION_GROUPS maps parent label → child pages
// so the sidebar can show/hide a parent based on whether any child is visible.

// ── Per-page definition: the tabs and page-scoped actions available ──────
export interface PagePermissionDef {
  /** Tab slugs shown as in-page tabs; empty array if the page has none. */
  tabs: string[]
  /** Action keys scoped to this page, e.g. "create_loan", "approve_loan". */
  actions: string[]
}

// ── A menu group: its title + a map of page-label → definition ───────────
export interface MenuGroupPermissionDef {
  [pageLabel: string]: PagePermissionDef
}

// ── The registry itself ──────────────────────────────────────────────────
export const PERMISSION_REGISTRY = {
  // ── 1. Overview ───────────────────────────────────────────────────────
  Overview: {
    Dashboard: {
      tabs: [],
      actions: ["export_pdf", "print"],
    },
  },

  // ── 2. Member Management ──────────────────────────────────────────────
  "Member Management": {
    "Member Panel": {
      tabs: ["all", "active", "pending", "suspended"],
      actions: ["create_member", "edit_member", "delete_member", "approve_member", "suspend_member", "export_pdf", "send_sms"],
    },
    "Pending Approvals": {
      tabs: ["member_requests", "profile_requests"],
      actions: ["approve", "reject", "request_more_info"],
    },
    "Member's Pending Req.": {
      tabs: ["profile_requests", "pending"],
      actions: ["approve", "reject", "request_more_info"],
    },
    // SubItems of the "Trust Score & Badges" accordion parent:
    "Trust Leaderboard": {
      tabs: [],
      actions: ["export_pdf", "print"],
    },
    "Achievement Badges": {
      tabs: ["all", "awarded"],
      actions: ["create_badge", "edit_badge", "delete_badge", "assign_badge"],
    },
    "Score Settings": {
      tabs: [],
      actions: ["edit_config", "reset_scores"],
    },
  },

  // ── 3. Transactions ───────────────────────────────────────────────────
  Transactions: {
    "Members Due List": {
      tabs: ["all", "overdue", "upcoming"],
      actions: ["send_sms", "export_pdf", "print", "apply_charge"],
    },
    "Deposit Entry": {
      tabs: ["pending", "approved", "reversed"],
      actions: ["create_deposit", "edit_deposit", "delete_deposit", "approve_deposit", "reverse_deposit", "print"],
    },
    "Withdrawal Entry": {
      tabs: ["pending", "approved", "reversed"],
      actions: ["create_withdrawal", "edit_withdrawal", "delete_withdrawal", "approve_withdrawal", "reverse_withdrawal", "print"],
    },
    "Distribute Income": {
      tabs: ["draft", "posted", "reversed"],
      actions: ["create_distribution", "post_distribution", "reverse_distribution", "print", "export_pdf"],
    },
    "Apply Charges": {
      tabs: ["pending", "approved", "reversed"],
      actions: ["create_charge", "edit_charge", "delete_charge", "approve_charge", "reverse_charge", "send_sms"],
    },
    // SubItems of the "Transaction Approvals" accordion parent:
    "Admin Submitted": {
      tabs: ["pending", "approved", "returned", "rejected"],
      actions: ["approve", "return", "reject", "reverse"],
    },
    "Member Requests": {
      tabs: ["pending", "approved", "rejected"],
      actions: ["approve", "reject", "request_more_info"],
    },
    "Cash Closing": {
      tabs: ["open", "closed"],
      actions: ["open_cash", "close_cash", "adjust", "print"],
    },
    "Transaction History": {
      tabs: ["deposits", "withdrawals", "charges", "distributions"],
      actions: ["export_pdf", "print", "view_detail", "reverse"],
    },
    "Fees & Charge Setup": {
      tabs: ["active", "inactive"],
      actions: ["create_fee", "edit_fee", "delete_fee", "toggle_active"],
    },
  },

  // ── 4. Finance & Accounting ───────────────────────────────────────────
  "Finance & Accounting": {
    "Loan Management": {
      tabs: ["overview", "pending", "active", "closed", "defaulted"],
      actions: ["create_loan", "edit_loan", "delete_loan", "approve_loan", "disburse_loan", "reject_loan", "record_repayment", "write_off", "export_pdf", "print", "send_sms"],
    },
    "Chart of Accounts": {
      tabs: ["assets", "liabilities", "income", "expense"],
      actions: ["create_account", "edit_account", "delete_account", "toggle_active"],
    },
    "Voucher Entry": {
      tabs: ["journal", "receipt", "payment", "contra"],
      actions: ["create_voucher", "edit_voucher", "delete_voucher", "post_voucher", "print"],
    },
    // SubItems of "Financial Statements":
    "Trial Balance": {
      tabs: [],
      actions: ["export_pdf", "print"],
    },
    "Balance Sheet": {
      tabs: [],
      actions: ["export_pdf", "print"],
    },
    "Profit & Loss": {
      tabs: [],
      actions: ["export_pdf", "print"],
    },
    // SubItems of "Reports":
    "Account Ledger": {
      tabs: [],
      actions: ["export_pdf", "print"],
    },
    "Member Ledger": {
      tabs: [],
      actions: ["export_pdf", "print", "send_sms"],
    },
    "Money Receipts": {
      tabs: [],
      actions: ["print", "export_pdf"],
    },
    "View Vouchers": {
      tabs: ["journal", "receipt", "payment"],
      actions: ["print", "reverse", "export_pdf"],
    },
  },

  // ── 5. Operations & Management ────────────────────────────────────────
  "Operations & Management": {
    "Meeting Management": {
      tabs: ["upcoming", "completed", "cancelled"],
      actions: ["create_meeting", "edit_meeting", "delete_meeting", "mark_attendance", "upload_minutes", "send_sms"],
    },
    "Project Management": {
      tabs: ["planning", "active", "completed"],
      actions: ["create_project", "edit_project", "delete_project", "record_expense", "record_revenue", "export_pdf"],
    },
    "Investment Management": {
      tabs: ["active", "exited", "draft"],
      actions: ["create_investment", "edit_investment", "delete_investment", "record_income", "record_exit", "record_valuation", "distribute_income", "export_pdf"],
    },
    // SubItems of "Task Management":
    "All Tasks": {
      tabs: ["my_tasks", "all_tasks", "completed", "overdue"],
      actions: ["create_task", "edit_task", "delete_task", "assign_task", "approve_task", "start_task", "complete_task", "log_time"],
    },
    "Task Reports": {
      tabs: [],
      actions: ["export_pdf", "print"],
    },
    Committees: {
      tabs: ["active", "archived"],
      actions: ["create_committee", "edit_committee", "delete_committee", "assign_member"],
    },
    "Special Wishes": {
      tabs: ["upcoming", "past"],
      actions: ["create_wish", "edit_wish", "delete_wish", "send_sms"],
    },
    // Election Management module — full lifecycle (create, configure, nominate,
    // vote, count, publish, form committee).
    "Election Management": {
      tabs: ["all", "draft", "nomination", "voting", "results", "archived", "test"],
      actions: [
        "create_election", "edit_election", "delete_draft_election", "clone_election",
        "configure_positions", "configure_rules", "open_nomination", "close_nomination",
        "finalize_candidates", "approve_candidate", "reject_candidate", "disqualify_candidate",
        "review_candidate", "override_eligibility", "open_voting", "close_voting",
        "reopen_voting", "count_votes", "publish_result", "publish_partial_result",
        "form_committee", "manage_vacancy", "create_runoff", "resolve_tie", "recount",
        "freeze_election", "unfreeze_election", "cancel_election", "manage_test_election",
        "rotate_keys", "assign_observer", "revoke_observer", "view_audit", "export_pdf",
      ],
    },
  },

  // ── 6. System & Settings ──────────────────────────────────────────────
  "System & Settings": {
    "User Control": {
      tabs: ["users", "roles", "audit"],
      actions: ["create_user", "edit_user", "delete_user", "deactivate_user", "assign_role", "manage_permissions", "view_audit"],
    },
    "Role Permissions": {
      tabs: ["roles", "matrix"],
      actions: ["create_role", "edit_role", "delete_role", "manage_permissions", "view_audit"],
    },
    // SubItems of "Somiti Settings":
    "Organization Info": {
      tabs: [],
      actions: ["edit"],
    },
    "Landing Page Content": {
      tabs: [],
      actions: ["edit"],
    },
    "Active Bank Accounts": {
      tabs: [],
      actions: ["create_account", "edit_account", "delete_account", "set_default"],
    },
    "Mail Server Setup": {
      tabs: [],
      actions: ["edit", "test_connection"],
    },
    "SMS Service API": {
      tabs: [],
      actions: ["edit", "test_connection", "send_test"],
    },
    "Approval Limits": {
      tabs: [],
      actions: ["create_limit", "edit_limit", "delete_limit"],
    },
    "Transparency Settings": {
      tabs: [],
      actions: ["edit", "toggle_feature"],
    },
    "Cloud Backup": {
      tabs: ["backups", "settings"],
      actions: ["create_backup", "restore_backup", "download_backup", "delete_backup"],
    },
  },
} as const satisfies Record<string, MenuGroupPermissionDef>

// ── Typed keys (as requested in the spec) ────────────────────────────────
export type MenuGroupKey = keyof typeof PERMISSION_REGISTRY
export type PageKey<G extends MenuGroupKey> = keyof (typeof PERMISSION_REGISTRY)[G]

// ============================================================================
// ACCORDION GROUPS — which accordion parent contains which child pages.
// Used by the sidebar (Part 6) to show/hide a parent accordion based on
// whether ANY of its child pages are visible to the user.
// ============================================================================
export const ACCORDION_GROUPS: Record<string, { group: MenuGroupKey; pages: string[] }> = {
  "Trust Score & Badges": {
    group: "Member Management",
    pages: ["Trust Leaderboard", "Achievement Badges", "Score Settings"],
  },
  "Transaction Approvals": {
    group: "Transactions",
    pages: ["Admin Submitted", "Member Requests"],
  },
  "Financial Statements": {
    group: "Finance & Accounting",
    pages: ["Trial Balance", "Balance Sheet", "Profit & Loss"],
  },
  Reports: {
    group: "Finance & Accounting",
    pages: ["Account Ledger", "Member Ledger", "Money Receipts", "View Vouchers"],
  },
  "Task Management": {
    group: "Operations & Management",
    pages: ["All Tasks", "Task Reports", "Committees"],
  },
  "Somiti Settings": {
    group: "System & Settings",
    pages: [
      "Organization Info",
      "Landing Page Content",
      "Active Bank Accounts",
      "Mail Server Setup",
      "SMS Service API",
      "Approval Limits",
      "Transparency Settings",
    ],
  },
}

// Inverse map: page label → the accordion parent that contains it (if any).
// Lets the sidebar resolve an accordion parent from a child page quickly.
export const PAGE_TO_ACCORDION: Record<string, string> = (() => {
  const out: Record<string, string> = {}
  for (const [parent, def] of Object.entries(ACCORDION_GROUPS)) {
    for (const page of def.pages) out[page] = parent
  }
  return out
})()

// ============================================================================
// KEY BUILDERS — assemble the "::"-separated permission key for each level.
// ============================================================================
const SEP = "::"

export function groupKey(menuGroup: string): string {
  return menuGroup
}

export function pageKey(menuGroup: string, page: string): string {
  return `${menuGroup}${SEP}${page}`
}

export function tabKey(menuGroup: string, page: string, tab: string): string {
  return `${menuGroup}${SEP}${page}${SEP}${tab}`
}

/**
 * Action key. Always 4 segments; the tab slot is an empty string when the
 * action applies to the whole page rather than a specific tab:
 *   "Finance & Accounting::Loan Management::::approve_loan"
 */
export function actionKey(
  menuGroup: string,
  page: string,
  action: string,
  tab?: string
): string {
  return `${menuGroup}${SEP}${page}${SEP}${tab ?? ""}${SEP}${action}`
}

// ============================================================================
// REGISTRY ENUMERATION — walk the whole tree to produce a flat list of every
// permission node that exists. Used by the seed (write Permission rows) and
// by the matrix UI (render every toggle).
// ============================================================================
export interface RegistryNode {
  menuGroup: string
  page: string
  tab: string
  action: string
  /** The full "::"-separated key for this node. */
  key: string
  /** Which level this node sits at. */
  level: "group" | "page" | "tab" | "action"
}

/** Every permission node in the registry, depth-first per page. */
export function enumerateRegistry(): RegistryNode[] {
  const nodes: RegistryNode[] = []
  for (const [group, pages] of Object.entries(PERMISSION_REGISTRY)) {
    nodes.push({ menuGroup: group, page: "", tab: "", action: "", key: groupKey(group), level: "group" })
    for (const [page, def] of Object.entries(pages)) {
      nodes.push({ menuGroup: group, page, tab: "", action: "", key: pageKey(group, page), level: "page" })
      for (const tab of def.tabs) {
        nodes.push({ menuGroup: group, page, tab, action: "", key: tabKey(group, page, tab), level: "tab" })
      }
      for (const action of def.actions) {
        nodes.push({ menuGroup: group, page, tab: "", action, key: actionKey(group, page, action), level: "action" })
      }
    }
  }
  return nodes
}

/** All distinct group titles (the 6 sidebar sections). */
export const MENU_GROUP_TITLES = Object.keys(PERMISSION_REGISTRY) as MenuGroupKey[]

/** All page labels within a group. */
export function pagesOf(group: MenuGroupKey): string[] {
  return Object.keys(PERMISSION_REGISTRY[group])
}

/** The PagePermissionDef for a group + page, or undefined if unknown. */
export function pageDef(group: MenuGroupKey, page: string): PagePermissionDef | undefined {
  return (PERMISSION_REGISTRY[group] as Record<string, PagePermissionDef>)[page]
}

/**
 * True if `key` is, or falls under, any key in `grantedKeys`. This powers the
 * "can see the group if I can see any page in it" visibility rule: e.g. a user
 * granted an action key implicitly can access its page and group.
 *
 *   keyBuckets("Finance & Accounting", granted) → true if granted has the
 *   group key, or any key prefixed "Finance & Accounting::".
 */
export function keyOrAnyDescendantIn(key: string, grantedKeys: Set<string>): boolean {
  if (grantedKeys.has(key)) return true
  const prefix = `${key}${SEP}`
  for (const g of grantedKeys) {
    if (g.startsWith(prefix)) return true
  }
  return false
}
