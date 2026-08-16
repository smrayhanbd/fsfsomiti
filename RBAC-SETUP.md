# RBAC Setup Guide

This guide explains how the permission system works and how to configure
it for your users.

## Quick start (3 steps)

### Step 1: Run the RBAC seed (one-time)

After deploying, run this once to populate the permission catalogue
and create the 5 default system roles:

```bash
# Locally, with DATABASE_URL set in .env
npm run seed:rbac

# Or on Vercel — run the seed against your production DB:
# npx prisma db seed -- --rbac
```

This creates:
- ~300 Permission rows (one per node in the registry)
- 5 system roles: Super Admin, Treasurer/Cashier, Auditor, Committee
  Member, Member Support
- Links your bootstrap admin user to the Super Admin role

### Step 2: Assign roles to users

1. Sign in as Super Admin
2. Go to **Dashboard → Users** (System & Settings → User Control)
3. Click any user → **Edit**
4. Under **Roles**, check the boxes for the roles you want to assign
5. Save

The user's permissions update immediately (no re-login needed).

### Step 3: Test it

1. Sign in as the user you just edited
2. Try to access a page they don't have permission for
   - e.g. if they're "Member Support", visit `/dashboard/projects`
   - Should redirect to `/dashboard/unauthorized`
3. Try to call a server action they don't have permission for
   - e.g. submit the "Create Project" form
   - Should show: "You do not have permission to perform 'create_project'"

---

## How the permission system works

### 3-level hierarchy

Permissions are organized as **menuGroup → page → action**:

```
Operations & Management                    ← menuGroup
├── Project Management                    ← page
│   ├── create_project                    ← action
│   ├── edit_project
│   ├── delete_project
│   ├── record_expense
│   └── record_revenue
└── Investment Management                 ← page
    ├── create_investment                 ← action
    └── ...
```

### Inheritance (grant parent → child gets everything)

Granting a **menuGroup** gives access to every page/action under it.
Granting a **page** gives access to every action on that page.
Granting a single **action** gives access to only that action.

This means:
- "Treasurer" role gets the whole **Transactions** group → all transaction actions
- "Auditor" role gets read-only actions (export_pdf, print, view_detail)
  under Finance & Accounting → can view reports but not create anything
- "Member Support" role gets the whole **Member Management** group

### Override system (per-user)

In addition to roles, you can add per-user overrides:

- **ALLOW** — grant a permission even if no role provides it
- **DENY** — revoke a permission even if a role grants it (DENY wins)

Use cases:
- A user has the "Treasurer" role but should NOT be able to approve
  withdrawals → add a DENY override on
  `Transactions::Withdrawal Entry::::approve_withdrawal`
- A user has the "Auditor" role but needs to be able to create journal
  vouchers → add an ALLOW override on
  `Finance & Accounting::Voucher Entry::::create_voucher`

### SUPER_ADMIN short-circuit

Users with the Super Admin role (or the legacy `User.role = "SUPER_ADMIN"`
string) bypass ALL permission checks. They can do everything.

---

## Default system roles

| Role | Description | What they can do |
|---|---|---|
| **Super Admin** | Full unrestricted access | Everything |
| **Treasurer / Cashier** | Full Transactions + read Finance | Deposits, withdrawals, charges, distributions, approvals, loans, vouchers, chart of accounts, read-only reports |
| **Auditor** | Read-only Finance + Transactions history | View reports, ledgers, transaction history. No create/edit/delete/approve |
| **Committee Member** | Operations & Management | Meetings, projects, investments, tasks, committees, wishes, elections |
| **Member Support** | Member Management | Members, approvals, trust score. View-only Transactions |

To create a custom role:
1. Go to **Dashboard → Role Permissions** (System & Settings)
2. Click **Create Role**
3. Name it (e.g. "Loan Officer")
4. Toggle the permissions you want to grant
5. Save

---

## Permission codes reference

### Project Management
- `create_project` — create a new project
- `edit_project` — edit an existing project
- `delete_project` — delete a draft project
- `record_expense` — record a project expense
- `record_revenue` — record project revenue
- `export_pdf` — export project reports

### Investment Management
- `create_investment` — create a new investment
- `edit_investment` — edit an existing investment
- `delete_investment` — delete a draft investment
- `record_income` — record investment income
- `record_exit` — record an investment exit
- `record_valuation` — record a market valuation
- `distribute_income` — distribute investment income to members
- `export_pdf` — export investment reports

### Distribute Income (Transactions)
- `create_distribution` — create a draft distribution
- `post_distribution` — post a draft (creates voucher + savings credits)
- `reverse_distribution` — reverse a posted distribution

### Loan Management
- `create_loan`, `edit_loan`, `delete_loan`, `approve_loan`,
  `disburse_loan`, `reject_loan`, `record_repayment`, `write_off`,
  `export_pdf`, `print`, `send_sms`

### User Control
- `create_user`, `edit_user`, `delete_user`, `deactivate_user`,
  `assign_role`, `manage_permissions`, `view_audit`

(And many more — see the full list at `/dashboard/roles` → any role →
Edit Permissions)

---

## Where enforcement happens

The permission system enforces at **3 layers**:

### 1. Frontend (UI visibility)
- Sidebar hides menus/pages the user can't access
- Buttons (Create, Edit, Delete, Approve) are hidden if the user lacks
  the corresponding action permission
- Tabs are hidden if the user lacks the tab permission

This is for UX only — not security.

### 2. Server components (page-level)
- Server components call `requirePageAccess(user, menuGroup, page)`
- If denied, redirect to `/dashboard/unauthorized`
- Blocks direct URL access

### 3. Server actions + API routes (action-level) — CRITICAL
- Every mutating server action calls `requireAction(user, menuGroup,
  page, action)` before doing any work
- Every mutating API route checks permissions before processing
- This is the security boundary — even if the frontend is bypassed
  (e.g. via browser console, curl, direct API call), the backend
  rejects the request

**Fail-closed**: if the permission check fails for any reason (DB
down, unknown permission, null user), the request is DENIED.

---

## Audit log

Every RBAC change is recorded in the `AuditLog` table:

- `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED`
- `ROLE_PERMISSIONS_REPLACED`
- `ROLE_ASSIGNED`, `ROLE_REVOKED`
- `OVERRIDE_ADDED`, `OVERRIDE_REMOVED`

View at **Dashboard → User Control → Audit** tab (requires
`view_audit` permission).

---

## Troubleshooting

### "You do not have permission to perform 'X'"

The user's role(s) don't grant the action. To fix:

1. Sign in as Super Admin
2. Go to Users → edit the user → Roles
3. Either assign a role that includes the action, OR
4. Add an ALLOW override for the specific action

### "Could not save / Unknown permission keys"

The Permission rows are missing from the DB. Re-run the seed:

```bash
npm run seed:rbac
```

### User can still see a menu they shouldn't

Check the user's roles and overrides at `/dashboard/users/[id]`. The
effective permission set is the union of all role permissions, with
overrides applied (DENY wins).

### User can still perform an action they shouldn't

This should NOT happen after v3.3.0. If it does:

1. Check the server action file in `app/actions/*.ts` — confirm it
   calls `requireAction()` or `hasPermission()`
2. Check the user's effective permissions at `/dashboard/users/[id]`
3. If the action is missing from the registry, add it to
   `lib/permissions/permission-registry.ts` and re-run `npm run seed:rbac`

Report the specific action + route so it can be fixed.

---

## For developers: how to protect a new server action

```ts
"use server"

import { getCurrentUser } from "@/lib/permissions"
import { requireAction, authErrorResult } from "@/lib/auth-guard"

const SCOPE = {
  menuGroup: "Operations & Management",
  page: "Project Management",
} as const

export async function myNewAction(input: Input): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "You must be signed in." }

  // Permission check — throws AuthorizationError on denial
  try {
    await requireAction(user, SCOPE.menuGroup, SCOPE.page, "my_new_action")
  } catch (e) {
    return authErrorResult(e)
  }

  // ... do the work ...
  return { ok: true }
}
```

If `my_new_action` is a new action not in the registry:

1. Add it to `lib/permissions/permission-registry.ts` under the right page
2. Mirror the change in `prisma/seed-permissions.js`
3. Run `npm run seed:rbac` to populate the new Permission row
4. Grant it to the appropriate roles via the matrix UI
