/**
 * Map of dashboard route paths → permission registry (menuGroup, page).
 *
 * Used by scripts/add-page-guards.ts to inject guardDashboardPage() calls
 * into every dashboard page's server component.
 *
 * The route patterns use Next.js dynamic segment notation ([id], etc.).
 * Trailing /page.tsx is omitted for brevity.
 *
 * Pages NOT in this map (like /dashboard itself, /dashboard/unauthorized,
 * /dashboard/profile) are either public-to-all-admins or self-service.
 */

interface RoutePerm {
  menuGroup: string
  page: string
}

export const DASHBOARD_ROUTE_PERMISSIONS: Record<string, RoutePerm> = {
  // ── Overview ────────────────────────────────────────────────────────
  "/dashboard": { menuGroup: "Overview", page: "Dashboard" },

  // ── Member Management ───────────────────────────────────────────────
  "/dashboard/members": { menuGroup: "Member Management", page: "Member Panel" },
  "/dashboard/members/add": { menuGroup: "Member Management", page: "Member Panel" },
  "/dashboard/members/[id]": { menuGroup: "Member Management", page: "Member Panel" },
  "/dashboard/members/[id]/edit": { menuGroup: "Member Management", page: "Member Panel" },
  "/dashboard/profile-approvals": { menuGroup: "Member Management", page: "Pending Approvals" },
  "/dashboard/trust-score": { menuGroup: "Member Management", page: "Trust Leaderboard" },
  "/dashboard/trust-score/[id]": { menuGroup: "Member Management", page: "Trust Leaderboard" },
  "/dashboard/trust-score/badges": { menuGroup: "Member Management", page: "Achievement Badges" },
  "/dashboard/trust-score/config": { menuGroup: "Member Management", page: "Score Settings" },

  // ── Transactions ───────────────────────────────────────────────────
  "/dashboard/due-list": { menuGroup: "Transactions", page: "Members Due List" },
  "/dashboard/transactions/deposits": { menuGroup: "Transactions", page: "Deposit Entry" },
  "/dashboard/deposits": { menuGroup: "Transactions", page: "Deposit Entry" },
  "/dashboard/transactions/withdrawals": { menuGroup: "Transactions", page: "Withdrawal Entry" },
  "/dashboard/income-distribution": { menuGroup: "Transactions", page: "Distribute Income" },
  "/dashboard/transactions/income-distribution": { menuGroup: "Transactions", page: "Distribute Income" },
  "/dashboard/distributions": { menuGroup: "Transactions", page: "Distribute Income" },
  "/dashboard/distributions/new": { menuGroup: "Transactions", page: "Distribute Income" },
  "/dashboard/distributions/[id]": { menuGroup: "Transactions", page: "Distribute Income" },
  "/dashboard/transactions/charges": { menuGroup: "Transactions", page: "Apply Charges" },
  "/dashboard/fees": { menuGroup: "Transactions", page: "Fees & Charge Setup" },
  "/dashboard/collection-entry": { menuGroup: "Transactions", page: "Apply Charges" },
  "/dashboard/collection-setup": { menuGroup: "Transactions", page: "Fees & Charge Setup" },
  "/dashboard/transaction-approvals": { menuGroup: "Transactions", page: "Admin Submitted" },
  "/dashboard/approvals": { menuGroup: "Transactions", page: "Member Requests" },
  "/dashboard/approvals/[id]": { menuGroup: "Transactions", page: "Member Requests" },
  "/dashboard/cash-closing": { menuGroup: "Transactions", page: "Cash Closing" },
  "/dashboard/transactions": { menuGroup: "Transactions", page: "Transaction History" },
  "/dashboard/transactions/[id]": { menuGroup: "Transactions", page: "Transaction History" },
  "/dashboard/receipts": { menuGroup: "Transactions", page: "Transaction History" },
  "/dashboard/receipts/[transactionId]": { menuGroup: "Transactions", page: "Transaction History" },

  // ── Finance & Accounting ───────────────────────────────────────────
  "/dashboard/loans": { menuGroup: "Finance & Accounting", page: "Loan Management" },
  "/dashboard/loans/[id]": { menuGroup: "Finance & Accounting", page: "Loan Management" },
  "/dashboard/loans/[id]/repay": { menuGroup: "Finance & Accounting", page: "Loan Management" },
  "/dashboard/loans/apply": { menuGroup: "Finance & Accounting", page: "Loan Management" },
  "/dashboard/loans/products/new": { menuGroup: "Finance & Accounting", page: "Loan Management" },
  "/dashboard/loans/products/[id]/edit": { menuGroup: "Finance & Accounting", page: "Loan Management" },
  "/dashboard/accounts": { menuGroup: "Finance & Accounting", page: "Chart of Accounts" },
  "/dashboard/voucher-entry": { menuGroup: "Finance & Accounting", page: "Voucher Entry" },
  "/dashboard/vouchers": { menuGroup: "Finance & Accounting", page: "View Vouchers" },
  "/dashboard/financials/trial-balance": { menuGroup: "Finance & Accounting", page: "Trial Balance" },
  "/dashboard/financials/balance-sheet": { menuGroup: "Finance & Accounting", page: "Balance Sheet" },
  "/dashboard/financials/profit-loss": { menuGroup: "Finance & Accounting", page: "Profit & Loss" },
  "/dashboard/financials/cash-flow": { menuGroup: "Finance & Accounting", page: "Trial Balance" },
  "/dashboard/financials/year-close": { menuGroup: "Finance & Accounting", page: "Trial Balance" },
  "/dashboard/account-ledger": { menuGroup: "Finance & Accounting", page: "Account Ledger" },
  "/dashboard/member-ledger": { menuGroup: "Finance & Accounting", page: "Member Ledger" },

  // ── Operations & Management ────────────────────────────────────────
  "/dashboard/meetings": { menuGroup: "Operations & Management", page: "Meeting Management" },
  "/dashboard/projects": { menuGroup: "Operations & Management", page: "Project Management" },
  "/dashboard/projects/create": { menuGroup: "Operations & Management", page: "Project Management" },
  "/dashboard/projects/[id]": { menuGroup: "Operations & Management", page: "Project Management" },
  "/dashboard/projects/[id]/edit": { menuGroup: "Operations & Management", page: "Project Management" },
  "/dashboard/projects/[id]/expenses/create": { menuGroup: "Operations & Management", page: "Project Management" },
  "/dashboard/projects/[id]/revenue/create": { menuGroup: "Operations & Management", page: "Project Management" },
  "/dashboard/investments": { menuGroup: "Operations & Management", page: "Investment Management" },
  "/dashboard/investments/create": { menuGroup: "Operations & Management", page: "Investment Management" },
  "/dashboard/investments/[id]": { menuGroup: "Operations & Management", page: "Investment Management" },
  "/dashboard/investments/[id]/edit": { menuGroup: "Operations & Management", page: "Investment Management" },
  "/dashboard/investments/[id]/income/create": { menuGroup: "Operations & Management", page: "Investment Management" },
  "/dashboard/investments/[id]/exit/create": { menuGroup: "Operations & Management", page: "Investment Management" },
  "/dashboard/investments/[id]/valuation/create": { menuGroup: "Operations & Management", page: "Investment Management" },
  "/dashboard/tasks": { menuGroup: "Operations & Management", page: "All Tasks" },
  "/dashboard/tasks/new": { menuGroup: "Operations & Management", page: "All Tasks" },
  "/dashboard/tasks/[id]": { menuGroup: "Operations & Management", page: "All Tasks" },
  "/dashboard/tasks/reports": { menuGroup: "Operations & Management", page: "Task Reports" },
  "/dashboard/committees": { menuGroup: "Operations & Management", page: "Committees" },
  "/dashboard/wishes": { menuGroup: "Operations & Management", page: "Special Wishes" },
  "/dashboard/elections": { menuGroup: "Operations & Management", page: "Election Management" },
  "/dashboard/elections/create": { menuGroup: "Operations & Management", page: "Election Management" },
  "/dashboard/elections/[id]": { menuGroup: "Operations & Management", page: "Election Management" },

  // ── System & Settings ──────────────────────────────────────────────
  "/dashboard/users": { menuGroup: "System & Settings", page: "User Control" },
  "/dashboard/users/new": { menuGroup: "System & Settings", page: "User Control" },
  "/dashboard/users/[id]": { menuGroup: "System & Settings", page: "User Control" },
  "/dashboard/permissions": { menuGroup: "System & Settings", page: "Role Permissions" },
  "/dashboard/permissions/roles": { menuGroup: "System & Settings", page: "Role Permissions" },
  "/dashboard/permissions/roles/[id]": { menuGroup: "System & Settings", page: "Role Permissions" },
  "/dashboard/settings/organization": { menuGroup: "System & Settings", page: "Organization Info" },
  "/dashboard/settings/site-content": { menuGroup: "System & Settings", page: "Landing Page Content" },
  "/dashboard/settings/bank": { menuGroup: "System & Settings", page: "Active Bank Accounts" },
  "/dashboard/settings/mail": { menuGroup: "System & Settings", page: "Mail Server Setup" },
  "/dashboard/settings/sms": { menuGroup: "System & Settings", page: "SMS Service API" },
  "/dashboard/settings/approval-limits": { menuGroup: "System & Settings", page: "Approval Limits" },
  "/dashboard/settings/transparency": { menuGroup: "System & Settings", page: "Transparency Settings" },
  "/dashboard/backup": { menuGroup: "System & Settings", page: "Cloud Backup" },
  "/dashboard/deposit-products": { menuGroup: "Transactions", page: "Fees & Charge Setup" },
}

// Pages that DON'T need a permission guard:
//   /dashboard/profile  — self-service, any logged-in admin can access
//   /dashboard/notifications — self-service
//   /dashboard/unauthorized — the 403 page itself
export const UNGUARDED_DASHBOARD_ROUTES = new Set([
  "/dashboard/profile",
  "/dashboard/notifications",
  "/dashboard/unauthorized",
])
