// Central accounting helpers shared across Chart of Accounts, Vouchers,
// Ledger, and Financial Statements. Keeping these in one place guarantees
// consistent currency formatting, type colour-coding, and tree math.

import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import {
  Wallet,
  Landmark,
  Scale,
  TrendingUp,
  TrendingDown,
  type LucideIcon,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types — mirror the Prisma enums so client components don't need to import
// the generated client (which would bloat the browser bundle).
// ---------------------------------------------------------------------------
export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE"
export type AccountNature = "DEBIT" | "CREDIT"
export type AccountStatus = "ACTIVE" | "INACTIVE"
export type VoucherType = "JOURNAL" | "RECEIPT" | "PAYMENT" | "CONTRA"
export type JournalStatus = "DRAFT" | "POSTED"

// Generic server-action result so callers can react with toasts without
// having to wrap every call in try/catch.
export type ActionResult = { ok: true } | { ok: false; error: string }

export interface AccountNode {
  id: string
  accountCode: string
  accountName: string
  accountType: AccountType
  nature: AccountNature
  status: AccountStatus
  category?: string | null
  currentBalance: number | string
  openingBalance: number | string
  currency: string
  description?: string | null
  isBank: boolean
  isCash: boolean
  allowPosting: boolean
  allowJournal: boolean
  taxDeductible?: boolean
  parentAccountId?: string | null
  childAccounts?: AccountNode[]
}

// ---------------------------------------------------------------------------
// Currency & number formatting
// ---------------------------------------------------------------------------
export function formatBDT(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  if (!isFinite(n)) return "৳ 0.00"
  return `৳ ${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Plain number formatting without the currency symbol. */
export function formatNumber(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  if (!isFinite(n)) return "0.00"
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// ---------------------------------------------------------------------------
// Account-type metadata — single source of truth for badges & colours
// ---------------------------------------------------------------------------
export interface AccountTypeMeta {
  label: string
  short: string
  icon: LucideIcon
  /** Tailwind text colour class for icons/headings */
  text: string
  /** Tailwind classes for a tinted badge */
  badge: string
  /** Tailwind classes for a soft chip background */
  chip: string
  /** Solid accent dot */
  dot: string
}

export const ACCOUNT_TYPE_META: Record<AccountType, AccountTypeMeta> = {
  ASSET: {
    label: "Asset",
    short: "A",
    icon: Wallet,
    text: "text-emerald-600 dark:text-emerald-400",
    badge:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50",
    chip: "bg-emerald-50 dark:bg-emerald-950/30",
    dot: "bg-emerald-500",
  },
  LIABILITY: {
    label: "Liability",
    short: "L",
    icon: Landmark,
    text: "text-rose-600 dark:text-rose-400",
    badge:
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/50",
    chip: "bg-rose-50 dark:bg-rose-950/30",
    dot: "bg-rose-500",
  },
  EQUITY: {
    label: "Equity",
    short: "E",
    icon: Scale,
    text: "text-blue-600 dark:text-blue-400",
    badge:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/50",
    chip: "bg-blue-50 dark:bg-blue-950/30",
    dot: "bg-blue-500",
  },
  INCOME: {
    label: "Income",
    short: "I",
    icon: TrendingUp,
    text: "text-green-600 dark:text-green-400",
    badge:
      "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-900/50",
    chip: "bg-green-50 dark:bg-green-950/30",
    dot: "bg-green-500",
  },
  EXPENSE: {
    label: "Expense",
    short: "X",
    icon: TrendingDown,
    text: "text-red-600 dark:text-red-400",
    badge:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50",
    chip: "bg-red-50 dark:bg-red-950/30",
    dot: "bg-red-500",
  },
}

export function accountTypeMeta(type: string): AccountTypeMeta {
  return (
    ACCOUNT_TYPE_META[type as AccountType] ?? {
      label: type,
      short: "?",
      icon: Wallet,
      text: "text-slate-600",
      badge: "bg-slate-50 text-slate-700 border-slate-200",
      chip: "bg-slate-50",
      dot: "bg-slate-400",
    }
  )
}

/** Default nature for an account type — used when suggesting new accounts. */
export function defaultNatureFor(type: AccountType): AccountNature {
  // Assets & Expenses are DEBIT-natured; Liabilities, Equity & Income CREDIT.
  return type === "ASSET" || type === "EXPENSE" ? "DEBIT" : "CREDIT"
}

// ---------------------------------------------------------------------------
// Voucher helpers
// ---------------------------------------------------------------------------
const VOUCHER_PREFIX: Record<VoucherType, string> = {
  JOURNAL: "JV",
  RECEIPT: "RV",
  PAYMENT: "PV",
  CONTRA: "CV",
}

export function voucherPrefix(type: VoucherType): string {
  return VOUCHER_PREFIX[type] ?? "JV"
}

/** Generate the next sequential voucher number for a given type. */
export async function nextVoucherNo(
  type: VoucherType,
  tx?: Prisma.TransactionClient
): Promise<string> {
  const prefix = voucherPrefix(type)
  // When called inside a `prisma.$transaction`, use the passed-in client so the
  // count read participates in the interactive transaction. Running it on the
  // global client alongside an outer Supabase pooled transaction can invalidate
  // the transaction ("Transaction ID is invalid, refers to an old closed
  // transaction") before subsequent writes run.
  const client = tx ?? prisma
  const count = await client.journalEntry.count({
    where: { voucherType: type },
  })
  return `${prefix}-${String(count + 1).padStart(4, "0")}`
}

export const VOUCHER_TYPE_LABELS: Record<VoucherType, string> = {
  JOURNAL: "Journal Voucher",
  RECEIPT: "Receipt Voucher",
  PAYMENT: "Payment Voucher",
  CONTRA: "Contra Voucher",
}

// ---------------------------------------------------------------------------
// Tree math — used by Chart of Accounts summary cards & grouping
// ---------------------------------------------------------------------------

/** Recursively compute the *rolled-up* balance for a node. */
export function rollUpBalance(node: AccountNode): number {
  const own = Number(node.currentBalance ?? 0)
  if (!node.childAccounts || node.childAccounts.length === 0) return own
  const childrenTotal = node.childAccounts.reduce(
    (sum, c) => sum + rollUpBalance(c),
    0
  )
  // For group accounts the currentBalance is usually the running total of its
  // own postings; we add children on top so the card reflects the whole tree.
  return own + childrenTotal
}

export interface SummaryTotals {
  assets: number
  liabilities: number
  equity: number
  income: number
  expenses: number
  bankAccounts: number
  cashAccounts: number
  totalAccounts: number
  postingAccounts: number
  activeAccounts: number
}

/** Compute headline stats from a fully-nested account tree. */
export function computeSummary(accounts: AccountNode[]): SummaryTotals {
  const flat = flattenTree(accounts)
  const byType = (t: AccountType) =>
    flat
      .filter((a) => a.accountType === t)
      .reduce((s, a) => s + Number(a.currentBalance ?? 0), 0)

  return {
    assets: byType("ASSET"),
    liabilities: byType("LIABILITY"),
    equity: byType("EQUITY"),
    income: byType("INCOME"),
    expenses: byType("EXPENSE"),
    bankAccounts: flat.filter((a) => a.isBank).length,
    cashAccounts: flat.filter((a) => a.isCash).length,
    totalAccounts: flat.length,
    postingAccounts: flat.filter((a) => a.allowPosting).length,
    activeAccounts: flat.filter((a) => a.status === "ACTIVE").length,
  }
}

/** Flatten the nested account tree into a flat array (depth-first). */
export function flattenTree(accounts: AccountNode[]): AccountNode[] {
  const out: AccountNode[] = []
  const walk = (nodes: AccountNode[]) => {
    for (const n of nodes) {
      out.push(n)
      if (n.childAccounts && n.childAccounts.length > 0) walk(n.childAccounts)
    }
  }
  walk(accounts)
  return out
}

/** Build a map of accountId → its chain of ancestors (root → node). */
export function buildPathLookup(
  accounts: AccountNode[]
): Map<string, AccountNode[]> {
  const byId = new Map<string, AccountNode>()
  for (const a of flattenTree(accounts)) byId.set(a.id, a)

  const lookup = new Map<string, AccountNode[]>()
  for (const node of byId.values()) {
    const chain: AccountNode[] = []
    let cursor: AccountNode | undefined = node
    while (cursor) {
      chain.unshift(cursor)
      cursor = cursor.parentAccountId
        ? byId.get(cursor.parentAccountId)
        : undefined
    }
    lookup.set(node.id, chain)
  }
  return lookup
}

/** Find the set of ancestor ids for a node (used to auto-expand matches). */
export function ancestorIdsOf(
  accounts: AccountNode[],
  targetId: string
): Set<string> {
  const path = buildPathLookup(accounts).get(targetId) ?? []
  return new Set(path.map((n) => n.id))
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** Convert a camelCase/UPPER enum value to Title Case for display. */
export function humanizeEnum(value: string | null | undefined): string {
  if (!value) return "—"
  return value
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Format an ISO date string as dd Mmm yyyy. */
export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}
