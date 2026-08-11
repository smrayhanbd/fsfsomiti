import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { isSuperAdmin } from "@/lib/permissions"
import type { ApprovalLevel } from "./types"

export interface ApprovalLimitRow {
  level: number
  label: string
  role: string // SUPER_ADMIN | ADMIN
  permission: string | null
  minAmount: number
  maxAmount: number
}

/**
 * Active approval tiers ordered by ascending amount (spec §13).
 * Returns [] when none are configured — the approve action treats that as
 * "no limits" (only the Maker-Checker rule applies).
 */
export async function loadApprovalLimits(): Promise<ApprovalLimitRow[]> {
  const rows = await prisma.approvalLimit.findMany({
    where: { isActive: true },
    orderBy: { minAmount: "asc" },
  })
  return rows.map((r) => ({
    level: r.level,
    label: r.label,
    role: r.role,
    permission: r.permission,
    minAmount: Number(r.minAmount),
    maxAmount: Number(r.maxAmount),
  }))
}

/** Resolve the tier a transaction of this amount must pass through. */
export function resolveLevelForAmount(
  amount: number,
  limits: ApprovalLimitRow[]
): ApprovalLevel | null {
  if (limits.length === 0) return null
  const tier = limits.find((l) => amount >= l.minAmount && amount <= l.maxAmount)
  return tier ? (`L${tier.level}` as ApprovalLevel) : null
}

/**
 * Highest amount the given user is authorised to approve, given the active
 * limits. SUPER_ADMIN can approve any amount (returns Infinity). Returns
 * Infinity when no limits are configured.
 *
 * NOTE: this does not itself check the permission grant — the caller must
 * also confirm `hasPermission` for tier.permission when role === "ADMIN".
 */
export function userApprovalCeiling(
  user: { role: string } | null | undefined,
  grantedPermissions: Set<string>,
  limits: ApprovalLimitRow[]
): number {
  if (isSuperAdmin(user)) return Infinity
  if (limits.length === 0) return Infinity
  let ceiling = 0
  for (const l of limits) {
    if (l.role !== "ADMIN") continue
    if (l.permission && !grantedPermissions.has(l.permission)) continue
    ceiling = Math.max(ceiling, l.maxAmount)
  }
  return ceiling
}

/**
 * Recompute the live withdrawable balance for a member, inside an existing
 * transaction so concurrent approvals see the same locked view (spec §7C).
 *
 * Withdrawable = (Σ deposits) − (Σ withdrawals) − minimum-reserved-balance.
 * The minimum-reserved-balance is intentionally 0 here so the Somiti can add
 * its own rule later; the Maker-Checker flow already catches underflows.
 */
export async function computeMemberBalance(
  tx: Prisma.TransactionClient,
  memberId: string
): Promise<{ deposit: number; withdrawal: number; balance: number }> {
  const rows = await tx.savings.findMany({
    where: { memberId },
    select: { amount: true, type: true },
  })
  const deposit = rows
    .filter((r) => r.type !== "WITHDRAWAL")
    .reduce((s, r) => s + Number(r.amount), 0)
  const withdrawal = rows
    .filter((r) => r.type === "WITHDRAWAL")
    .reduce((s, r) => s + Number(r.amount), 0)
  return { deposit, withdrawal, balance: deposit - withdrawal }
}

/** Map a TransactionType to the Savings mirror row's `type` value. */
export function savingsTypeFor(
  transactionType: "DEPOSIT" | "WITHDRAWAL" | "CHARGE" | "INCOME_DISTRIBUTION"
): string {
  switch (transactionType) {
    case "DEPOSIT":
      return "MONTHLY"
    case "WITHDRAWAL":
      return "WITHDRAWAL"
    case "CHARGE":
      return "FINE"
    case "INCOME_DISTRIBUTION":
      return "DONATION"
    default:
      return "MONTHLY"
  }
}
