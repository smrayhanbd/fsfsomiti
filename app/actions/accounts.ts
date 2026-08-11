"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import type {
  AccountType,
  AccountNature,
  AccountStatus,
} from "@/lib/accounting"
import {
  getCurrentUser,
  requirePermission,
  PERMISSIONS,
} from "@/lib/permissions"

// Generic action result so callers can react with toasts without try/catch.
export type ActionResult = { ok: true } | { ok: false; error: string }

const ACCOUNTS_PATH = "/dashboard/accounts"

/** Normalise & lightly validate the payload shared by create + update. */
interface AccountInput {
  accountCode: string
  accountName: string
  parentAccountId?: string | null
  accountType: AccountType
  category?: string | null
  nature: AccountNature
  openingBalance?: number | string
  currency?: string
  description?: string | null
  isBank?: boolean
  isCash?: boolean
  allowPosting?: boolean
  allowJournal?: boolean
  taxDeductible?: boolean
  status?: AccountStatus
}

function parseInput(formData: FormData): AccountInput {
  return {
    accountCode: ((formData.get("accountCode") as string) || "").trim(),
    accountName: ((formData.get("accountName") as string) || "").trim(),
    parentAccountId:
      (formData.get("parentAccountId") as string) || null,
    accountType: (formData.get("accountType") as string) as AccountType,
    category: (formData.get("category") as string) || null,
    nature: (formData.get("nature") as string) as AccountNature,
    openingBalance: parseFloat((formData.get("openingBalance") as string) || "0") || 0,
    currency: (formData.get("currency") as string) || "BDT",
    description: (formData.get("description") as string) || null,
    isBank: formData.get("isBank") === "on" || formData.get("isBank") === "true",
    isCash: formData.get("isCash") === "on" || formData.get("isCash") === "true",
    allowPosting:
      formData.get("allowPosting") === "on" ||
      formData.get("allowPosting") === "true",
    allowJournal:
      formData.get("allowJournal") === "on" ||
      formData.get("allowJournal") === "true",
    taxDeductible:
      formData.get("taxDeductible") === "on" ||
      formData.get("taxDeductible") === "true",
    status: (formData.get("status") as string) as AccountStatus,
  }
}

function validateInput(input: AccountInput): string | null {
  if (!input.accountCode) return "Account code is required."
  if (!/^[A-Za-z0-9-]+$/.test(input.accountCode))
    return "Account code may only contain letters, numbers and hyphens."
  if (!input.accountName) return "Account name is required."
  if (!input.accountType) return "Account type is required."
  if (!input.nature) return "Account nature is required."
  return null
}

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------
export async function createAccount(formData: FormData): Promise<ActionResult> {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  const input = parseInput(formData)
  const error = validateInput(input)
  if (error) return { ok: false, error }

  try {
    // Enforce code uniqueness explicitly so we can return a friendly message.
    const existing = await prisma.account.findUnique({
      where: { accountCode: input.accountCode },
    })
    if (existing) return { ok: false, error: "Account code already exists." }

    // A child account inherits its parent's account type (kept consistent).
    if (input.parentAccountId) {
      const parent = await prisma.account.findUnique({
        where: { id: input.parentAccountId },
        select: { accountType: true },
      })
      if (parent && parent.accountType !== input.accountType) {
        return {
          ok: false,
          error: `Child account type must match its parent (${parent.accountType}).`,
        }
      }
    }

    const opening = Number(input.openingBalance ?? 0)
    await prisma.account.create({
      data: {
        accountCode: input.accountCode,
        accountName: input.accountName,
        parentAccountId: input.parentAccountId || null,
        accountType: input.accountType,
        category: input.category || null,
        nature: input.nature,
        openingBalance: opening,
        currentBalance: opening,
        currency: input.currency || "BDT",
        description: input.description || null,
        isBank: !!input.isBank,
        isCash: !!input.isCash,
        allowPosting: input.allowPosting ?? true,
        allowJournal: input.allowJournal ?? true,
        taxDeductible: !!input.taxDeductible,
        status: input.status || "ACTIVE",
      },
    })
    revalidatePath(ACCOUNTS_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------
export async function updateAccount(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  const input = parseInput(formData)
  const error = validateInput(input)
  if (error) return { ok: false, error }

  try {
    const current = await prisma.account.findUnique({ where: { id } })
    if (!current) return { ok: false, error: "Account not found." }

    if (input.accountCode !== current.accountCode) {
      const clash = await prisma.account.findUnique({
        where: { accountCode: input.accountCode },
      })
      if (clash) return { ok: false, error: "Account code already exists." }
    }

    if (input.parentAccountId && input.parentAccountId === id) {
      return { ok: false, error: "An account cannot be its own parent." }
    }

    if (input.parentAccountId) {
      const parent = await prisma.account.findUnique({
        where: { id: input.parentAccountId },
        select: { accountType: true },
      })
      if (parent && parent.accountType !== input.accountType) {
        return {
          ok: false,
          error: `Account type must match its parent (${parent.accountType}).`,
        }
      }
    }

    const opening = Number(input.openingBalance ?? 0)
    // Shift currentBalance by the delta in opening balance so historical
    // postings remain reflected. (No postings yet → currentBalance = opening.)
    const delta = opening - Number(current.openingBalance ?? 0)
    const nextBalance = Number(current.currentBalance) + delta

    await prisma.account.update({
      where: { id },
      data: {
        accountCode: input.accountCode,
        accountName: input.accountName,
        parentAccountId: input.parentAccountId || null,
        accountType: input.accountType,
        category: input.category || null,
        nature: input.nature,
        openingBalance: opening,
        currentBalance: nextBalance,
        currency: input.currency || "BDT",
        description: input.description || null,
        isBank: !!input.isBank,
        isCash: !!input.isCash,
        allowPosting: input.allowPosting ?? true,
        allowJournal: input.allowJournal ?? true,
        taxDeductible: !!input.taxDeductible,
        status: input.status || current.status,
      },
    })
    revalidatePath(ACCOUNTS_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// STATUS TOGGLE
// ---------------------------------------------------------------------------
export async function toggleAccountStatus(id: string): Promise<ActionResult> {
  try {
    await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
    const acc = await prisma.account.findUnique({
      where: { id },
      select: { status: true },
    })
    if (!acc) return { ok: false, error: "Account not found." }
    await prisma.account.update({
      where: { id },
      data: { status: acc.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
    })
    revalidatePath(ACCOUNTS_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// DELETE — guarded against destroying the chart
// ---------------------------------------------------------------------------
export async function deleteAccount(accountId: string): Promise<ActionResult> {
  try {
    await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
    const hasChildren = await prisma.account.findFirst({
      where: { parentAccountId: accountId },
      select: { id: true },
    })
    if (hasChildren) {
      return {
        ok: false,
        error: "Cannot delete: this account has child accounts. Remove or reassign them first.",
      }
    }

    const hasPostings = await prisma.journalLine.findFirst({
      where: { accountId },
      select: { id: true },
    })
    if (hasPostings) {
      return {
        ok: false,
        error: "Cannot delete: this account has journal postings. Archive it instead.",
      }
    }

    await prisma.account.delete({ where: { id: accountId } })
    revalidatePath(ACCOUNTS_PATH)
    return { ok: true }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return { ok: false, error: "Account could not be deleted." }
    }
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// Recompute an account's running balance from its journal lines.
// Useful after manual DB edits, seed imports, or for integrity checks.
// ---------------------------------------------------------------------------
export async function recomputeAccountBalance(
  accountId: string
): Promise<ActionResult> {
  try {
    await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, nature: true, openingBalance: true },
    })
    if (!account) return { ok: false, error: "Account not found." }

    const agg = await prisma.journalLine.aggregate({
      where: { accountId },
      _sum: { debit: true, credit: true },
    })
    const debit = Number(agg._sum.debit ?? 0)
    const credit = Number(agg._sum.credit ?? 0)
    const opening = Number(account.openingBalance ?? 0)
    // Debit-natured accounts (assets/expenses) increase with debit postings.
    const balance =
      account.nature === "DEBIT"
        ? opening + debit - credit
        : opening + credit - debit

    await prisma.account.update({
      where: { id: accountId },
      data: { currentBalance: balance },
    })
    revalidatePath(ACCOUNTS_PATH)
    revalidatePath("/dashboard/account-ledger")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
