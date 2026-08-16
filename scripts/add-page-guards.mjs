import fs from "node:fs"
import path from "node:path"

const ROOT = path.resolve(process.cwd())
const PAGES_DIR = path.join(ROOT, "app/dashboard")

const ROUTE_PERMS = {
  "/dashboard": { menuGroup: "Overview", page: "Dashboard" },
  "/dashboard/members": { menuGroup: "Member Management", page: "Member Panel" },
  "/dashboard/members/add": { menuGroup: "Member Management", page: "Member Panel" },
  "/dashboard/members/[id]": { menuGroup: "Member Management", page: "Member Panel" },
  "/dashboard/members/[id]/edit": { menuGroup: "Member Management", page: "Member Panel" },
  "/dashboard/profile-approvals": { menuGroup: "Member Management", page: "Pending Approvals" },
  "/dashboard/trust-score": { menuGroup: "Member Management", page: "Trust Leaderboard" },
  "/dashboard/trust-score/[id]": { menuGroup: "Member Management", page: "Trust Leaderboard" },
  "/dashboard/trust-score/badges": { menuGroup: "Member Management", page: "Achievement Badges" },
  "/dashboard/trust-score/config": { menuGroup: "Member Management", page: "Score Settings" },
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

const UNGUARDED = new Set([
  "/dashboard/profile",
  "/dashboard/notifications",
  "/dashboard/unauthorized",
])

function findPageFiles(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findPageFiles(fullPath))
    } else if (entry.name === "page.tsx") {
      results.push(fullPath)
    }
  }
  return results
}

function routeFromPath(pageFilePath) {
  const rel = path.relative(path.join(ROOT, "app"), pageFilePath).replace(/\\/g, "/")
  return "/" + rel.replace(/\/page\.tsx$/, "")
}

function hasGuard(content) {
  return content.includes("guardDashboardPage(")
}

// Find the position of the function BODY's opening brace.
// The function signature can span multiple lines:
//   export default async function Name({
//     params,
//   }: {
//     params: Promise<{ id: string }>
//   }) {
//     <-- THIS is the body brace we want
//
// Or a single line:
//   export default async function Name() {
//     <-- THIS is the body brace
//
// Strategy: find `export default async function Name` then track
// parentheses to find the matching closing `)` of the params, then
// the next `{` is the body brace.
function findBodyBracePos(content, fnStart) {
  // Find the opening `(` of the params
  let i = content.indexOf("(", fnStart)
  if (i === -1) return -1
  // Track paren depth
  let depth = 1
  i++
  while (i < content.length && depth > 0) {
    const c = content[i]
    if (c === "(") depth++
    else if (c === ")") depth--
    i++
  }
  // i is now just past the closing `)` — find the next `{`
  const bodyBrace = content.indexOf("{", i)
  return bodyBrace
}

function addGuard(filePath, menuGroup, page) {
  const content = fs.readFileSync(filePath, "utf8")
  if (hasGuard(content)) {
    return false
  }

  // Match either `async function` or `function` (sync components)
  const fnMatch = content.match(/export\s+default\s+(async\s+)?function\s+(\w+)\s*\(/)
  if (!fnMatch) {
    console.warn(`  WARN: ${filePath}: no default function found — skipping`)
    return false
  }

  const isAsync = !!fnMatch[1]
  const fnName = fnMatch[2]
  const fnStart = fnMatch.index

  // Find the body brace (after the closing paren of the params)
  const bodyBrace = findBodyBracePos(content, fnStart)
  if (bodyBrace === -1) {
    console.warn(`  WARN: ${filePath}: couldn't find body brace — skipping`)
    return false
  }

  // If the function is not async, make it async (guardDashboardPage is async)
  let newContent = content
  if (!isAsync) {
    newContent = newContent.replace(
      `export default function ${fnName}`,
      `export default async function ${fnName}`
    )
  }

  // Add the guard import if not present
  if (!newContent.includes('from "@/lib/page-guard"')) {
    // Find the last import line. Handle multi-line imports by looking for
    // the closing `} from "..."` or a single-line `import ... from "..."`.
    const lines = newContent.split("\n")
    let lastImportEndIdx = -1
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Match single-line import: import foo from "bar"
      // or: import { foo } from "bar"
      if (line.match(/^import\s+.*from\s+["']/) && (line.match(/["'];?\s*$/) || line.match(/["']\s*$/))) {
        lastImportEndIdx = i
      }
      // Match closing line of multi-line import: } from "bar"
      else if (line.match(/^\s*}\s*from\s+["']/)) {
        lastImportEndIdx = i
      }
      // Once we're past all imports, stop
      else if (lastImportEndIdx >= 0 && i > lastImportEndIdx + 2 && line.trim() && !line.trim().startsWith("//") && !line.match(/^import/)) {
        break
      }
    }
    if (lastImportEndIdx >= 0) {
      lines.splice(lastImportEndIdx + 1, 0, `import { guardDashboardPage } from "@/lib/page-guard"`)
      newContent = lines.join("\n")
    } else {
      newContent = `import { guardDashboardPage } from "@/lib/page-guard"\n` + newContent
    }
  }

  // Re-find the body brace (offset changed if we inserted an import)
  const newFnStart = newContent.indexOf(`export default async function ${fnName}`)
  const newBodyBrace = findBodyBracePos(newContent, newFnStart)
  if (newBodyBrace === -1) {
    console.warn(`  WARN: ${filePath}: couldn't re-find body brace after import insert — skipping`)
    return false
  }

  const guardCall = `  // Page-level permission guard — redirects to /dashboard/unauthorized\n  // if the user doesn't have access to this page.\n  await guardDashboardPage(${JSON.stringify(menuGroup)}, ${JSON.stringify(page)})\n\n`

  newContent =
    newContent.slice(0, newBodyBrace + 1) +
    "\n" + guardCall +
    newContent.slice(newBodyBrace + 1)

  fs.writeFileSync(filePath, newContent, "utf8")
  return true
}

const pageFiles = findPageFiles(PAGES_DIR)
let added = 0
let skipped = 0
let unguarded = 0
let noMatch = 0

for (const file of pageFiles) {
  const route = routeFromPath(file)
  if (UNGUARDED.has(route)) {
    unguarded++
    continue
  }
  const perm = ROUTE_PERMS[route]
  if (!perm) {
    console.warn(`  WARN: No permission mapping for ${route} — skipping`)
    noMatch++
    continue
  }
  const wasAdded = addGuard(file, perm.menuGroup, perm.page)
  if (wasAdded) {
    console.log(`  OK: ${route} -> ${perm.menuGroup}::${perm.page}`)
    added++
  } else {
    skipped++
  }
}

console.log(`\n--- Summary ---`)
console.log(`Guards added: ${added}`)
console.log(`Already guarded (skipped): ${skipped}`)
console.log(`Unguarded routes (profile, etc.): ${unguarded}`)
console.log(`No permission mapping: ${noMatch}`)
console.log(`Total pages scanned: ${pageFiles.length}`)
