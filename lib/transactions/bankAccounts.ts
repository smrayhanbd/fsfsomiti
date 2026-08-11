import prisma from "@/lib/prisma"
import type { PaymentMethod } from "@/lib/transactions/types"

/**
 * Collection-method groups surfaced in the Deposit UI. Methods in the same
 * group share one default BankAccount — e.g. BANK_TRANSFER & CHEQUE both fall
 * back to the same bank COA.
 */
export type MethodGroup = "CASH" | "BANK" | "MOBILE"

export const METHOD_GROUPS: { group: MethodGroup; label: string; methods: PaymentMethod[] }[] = [
  { group: "CASH", label: "Cash", methods: ["CASH"] },
  { group: "BANK", label: "Bank Transfer / Cheque", methods: ["BANK_TRANSFER", "CHEQUE"] },
  { group: "MOBILE", label: "Mobile Banking", methods: ["BKASH", "NAGAD", "ROCKET"] },
]

/** Human label for each granular PaymentMethod. */
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
}

/** Resolve the UI group for a granular payment method. */
export function groupForMethod(method: PaymentMethod): MethodGroup {
  if (method === "CASH") return "CASH"
  if (method === "BANK_TRANSFER" || method === "CHEQUE") return "BANK"
  return "MOBILE"
}

/** A resolved default COA for a payment method — passed down to the Deposit form. */
export interface DefaultCoa {
  paymentMethod: PaymentMethod
  group: MethodGroup
  /** The BankAccount row id (for display/audit), or null if none configured. */
  bankAccountId: string | null
  coaAccountId: string | null
  coaAccountCode: string | null
  coaAccountName: string | null
  /** True when no active BankAccount exists for this method's group. */
  missing: boolean
}

/**
 * Resolve the default Received-COA for a single payment method. Reads the
 * BankAccount configured in Somiti Settings → Active Bank Accounts.
 *
 * Selection order: the active, `isDefault` BankAccount for the method's group;
 * if none is flagged default, the first active BankAccount in the group; if
 * the group is empty entirely, returns `missing: true` so the form can warn
 * and let the user pick a COA manually.
 */
export async function getDefaultCoaForMethod(paymentMethod: PaymentMethod): Promise<DefaultCoa> {
  const group = groupForMethod(paymentMethod)
  const groupMethods = METHOD_GROUPS.find((g) => g.group === group)!.methods

  // Prefer the default for the group, else fall back to any active account.
  const bankAccount = await prisma.bankAccount.findFirst({
    where: { paymentMethod: { in: groupMethods }, isActive: true, isDefault: true },
    include: { coaAccount: { select: { id: true, accountCode: true, accountName: true } } },
    orderBy: [{ isDefault: "desc" }, { accountName: "asc" }],
  })

  if (bankAccount) {
    return {
      paymentMethod,
      group,
      bankAccountId: bankAccount.id,
      coaAccountId: bankAccount.coaAccountId,
      coaAccountCode: bankAccount.coaAccount.accountCode,
      coaAccountName: bankAccount.coaAccount.accountName,
      missing: false,
    }
  }

  // No default flagged — try any active account in the group.
  const fallback = await prisma.bankAccount.findFirst({
    where: { paymentMethod: { in: groupMethods }, isActive: true },
    include: { coaAccount: { select: { id: true, accountCode: true, accountName: true } } },
    orderBy: { accountName: "asc" },
  })

  if (fallback) {
    return {
      paymentMethod,
      group,
      bankAccountId: fallback.id,
      coaAccountId: fallback.coaAccountId,
      coaAccountCode: fallback.coaAccount.accountCode,
      coaAccountName: fallback.coaAccount.accountName,
      missing: false,
    }
  }

  return { paymentMethod, group, bankAccountId: null, coaAccountId: null, coaAccountCode: null, coaAccountName: null, missing: true }
}

/**
 * Resolve the default Received-COA for every group at once. Used by the
 * Deposit form's server component to pre-seed the auto-mapping for all three
 * groups (so switching methods client-side needs no round-trip).
 */
export async function getDefaultCoasForAllGroups(): Promise<DefaultCoa[]> {
  // One lookup per distinct method is enough (the resolver dedupes by group).
  const seeds: PaymentMethod[] = ["CASH", "BANK_TRANSFER", "BKASH"]
  const results = await Promise.all(seeds.map((m) => getDefaultCoaForMethod(m)))
  // Dedupe by group — keep the first per group.
  const seen = new Set<MethodGroup>()
  return results.filter((r) => {
    if (seen.has(r.group)) return false
    seen.add(r.group)
    return true
  })
}

/** Groups that currently have no active BankAccount configured. */
export function missingGroups(defaults: DefaultCoa[]): MethodGroup[] {
  return defaults.filter((d) => d.missing).map((d) => d.group)
}
