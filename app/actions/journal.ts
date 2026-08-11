"use server"

import prisma, { directPrisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { nextVoucherNo, type VoucherType } from "@/lib/accounting"
import { lockRow } from "@/lib/transactions/lock"
import type { ActionResult } from "@/app/actions/accounts"
import {
  getCurrentUser,
  requirePermission,
  PERMISSIONS,
} from "@/lib/permissions"

const PATHS = [
  "/dashboard/voucher-entry",
  "/dashboard/vouchers",
  "/dashboard/accounts",
  "/dashboard/account-ledger",
  "/dashboard/financials/trial-balance",
  "/dashboard/financials/balance-sheet",
  "/dashboard/financials/profit-loss",
]

function revalidateAll() {
  PATHS.forEach((p) => revalidatePath(p))
}

export interface JournalLineInput {
  accountId: string
  debit: number
  credit: number
  memo?: string
}

export interface JournalEntryInput {
  voucherType: VoucherType
  entryDate: string // ISO date
  narration: string
  referenceNo?: string
  memberId?: string | null
  status?: "DRAFT" | "POSTED"
  lines: JournalLineInput[]
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
function validateInput(input: JournalEntryInput): string | null {
  if (!input.voucherType) return "Voucher type is required."
  if (!input.narration?.trim()) return "Narration is required."
  if (!input.entryDate) return "Entry date is required."
  if (!input.lines || input.lines.length < 2)
    return "At least two posting lines are required."

  // Every line must reference a real account.
  const seenAccounts = new Set<string>()
  let totalDebit = 0
  let totalCredit = 0

  for (const line of input.lines) {
    if (!line.accountId) return "Every line must reference an account."
    if (line.debit === 0 && line.credit === 0)
      return "Every line must have either a debit or a credit."
    if (line.debit > 0 && line.credit > 0)
      return "A line cannot have both debit and credit."
    if (line.debit < 0 || line.credit < 0)
      return "Debit and credit cannot be negative."
    seenAccounts.add(line.accountId)
    totalDebit += Number(line.debit || 0)
    totalCredit += Number(line.credit || 0)
  }

  // A valid double-entry must balance to the cent.
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    return `Voucher is not balanced. Debits ${totalDebit.toFixed(2)} ≠ Credits ${totalCredit.toFixed(2)}.`
  }
  if (seenAccounts.size < 2)
    return "A journal entry must involve at least two different accounts."

  return null
}

/**
 * Apply (or reverse) the balance effect of a set of lines.
 * Debit-natured accounts increase on debit; credit-natured on credit.
 */
async function applyLineEffects(
  tx: Prisma.TransactionClient,
  lines: JournalLineInput[],
  sign: 1 | -1
) {
  // Group postings by account so we update each account once.
  const grouped = new Map<string, { debit: number; credit: number }>()
  for (const l of lines) {
    const g = grouped.get(l.accountId) ?? { debit: 0, credit: 0 }
    g.debit += Number(l.debit || 0)
    g.credit += Number(l.credit || 0)
    grouped.set(l.accountId, g)
  }

  for (const [accountId, { debit, credit }] of grouped) {
    const acc = await tx.account.findUnique({
      where: { id: accountId },
      select: { nature: true, currentBalance: true, openingBalance: true },
    })
    // B23: never silently skip a missing account. A missing account here means
    // a JournalLine was written with an accountId that doesn't exist — a
    // referential integrity violation we should fail loudly on, not absorb.
    if (!acc) {
      throw new Error(
        `Account ${accountId} not found while applying line effects — the posting was aborted before any balance was changed.`
      )
    }

    const net =
      acc.nature === "DEBIT" ? debit - credit : credit - debit
    const next = Number(acc.currentBalance) + sign * net
    await tx.account.update({
      where: { id: accountId },
      data: { currentBalance: next },
    })
  }
}

// ---------------------------------------------------------------------------
// CREATE — optionally posts immediately if status === "POSTED"
// ---------------------------------------------------------------------------
export async function createJournalEntry(
  input: JournalEntryInput
): Promise<{ ok: true; voucherNo: string } | { ok: false; error: string }> {
  try {
    await requirePermission(await getCurrentUser(), PERMISSIONS.TRANSACTION_CREATE)
    const error = validateInput(input)
    if (error) return { ok: false, error }
    const voucherNo = await nextVoucherNo(input.voucherType)
    const totalDebit = input.lines.reduce((s, l) => s + Number(l.debit || 0), 0)
    const totalCredit = input.lines.reduce((s, l) => s + Number(l.credit || 0), 0)
    const status = input.status === "POSTED" ? "POSTED" : "DRAFT"

    await directPrisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          voucherNo,
          voucherType: input.voucherType,
          entryDate: new Date(input.entryDate),
          narration: input.narration.trim(),
          referenceNo: input.referenceNo?.trim() || null,
          memberId: input.memberId || null,
          status,
          totalDebit,
          totalCredit,
          lines: {
            create: input.lines.map((l) => ({
              accountId: l.accountId,
              debit: Number(l.debit || 0),
              credit: Number(l.credit || 0),
              memo: l.memo?.trim() || null,
            })),
          },
        },
      })

      if (status === "POSTED") {
        await applyLineEffects(tx, input.lines, 1)
      }
      return entry
    })

    revalidateAll()
    return { ok: true, voucherNo }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// POST a draft — applies balance effects atomically
// ---------------------------------------------------------------------------
export async function postJournalEntry(
  entryId: string
): Promise<ActionResult> {
  try {
    await requirePermission(await getCurrentUser(), PERMISSIONS.TRANSACTION_APPROVE)
    const result = await directPrisma.$transaction(async (tx) => {
      // B11: lock the JournalEntry row so two concurrent POST actions on the
      // same draft can't both apply balance effects (which would double the
      // Dr/Cr totals on each affected account).
      await lockRow(tx, "JournalEntry", entryId)
      const entry = await tx.journalEntry.findUnique({
        where: { id: entryId },
        include: { lines: true },
      })
      if (!entry) throw new Error("Journal entry not found.")
      if (entry.status === "POSTED")
        throw new Error("Entry is already posted.")

      await applyLineEffects(
        tx,
        entry.lines.map((l) => ({
          accountId: l.accountId,
          debit: Number(l.debit),
          credit: Number(l.credit),
        })),
        1
      )

      return tx.journalEntry.update({
        where: { id: entryId },
        data: { status: "POSTED" },
      })
    })

    if (!result) return { ok: false, error: "Journal entry not found." }
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// DELETE — only DRAFTs may be removed; POSTED entries must be reversed.
// (Reversal/reversing-voucher can be added later.)
// ---------------------------------------------------------------------------
export async function deleteJournalEntry(
  entryId: string
): Promise<ActionResult> {
  try {
    await requirePermission(await getCurrentUser(), PERMISSIONS.TRANSACTION_CREATE)
    const entry = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      select: { status: true },
    })
    if (!entry) return { ok: false, error: "Journal entry not found." }
    if (entry.status === "POSTED") {
      return {
        ok: false,
        error:
          "Posted entries cannot be deleted. Create a reversing voucher instead.",
      }
    }

    await prisma.journalEntry.delete({ where: { id: entryId } })
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
