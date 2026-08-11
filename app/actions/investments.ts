"use server"

// Investment Management server actions.
//
// Every financial event (purchase / income / exit / valuation / write-off)
// wraps its writes in a single `prisma.$transaction` and calls the shared
// lib/portfolio/posting service so a balanced, POSTED JournalEntry is
// created atomically with the investment record. All actions return the
// discriminated ActionResult union so client forms can react with toasts.

import prisma, { directPrisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/permissions"
import { PERMISSIONS } from "@/lib/permissions"
import {
  postInvestmentPurchase,
  postInvestmentIncome,
  postInvestmentExit,
  postInvestmentWriteOff,
} from "@/lib/portfolio/posting"
import { nextInvestmentNo } from "@/lib/portfolio/ids"
import { resolveAccountId, assetCodeForTypeSlug, incomeCodeForType } from "@/lib/portfolio/accounting"
import { writeAuditLog, type ActionResult } from "@/lib/portfolio/validation"
import { lockRow } from "@/lib/transactions/lock"

const PATHS = [
  "/dashboard/investments",
  "/dashboard/projects",
  "/dashboard/accounts",
  "/dashboard/account-ledger",
  "/dashboard/vouchers",
]

function revalidateAll() {
  PATHS.forEach((p) => revalidatePath(p))
}

// ── Input shapes (plain objects, not FormData) ──────────────────────────
// The client forms build these and pass them directly to the action.

export interface InvestmentInput {
  id?: string // present on edit
  name: string
  investmentTypeId: string
  typeSlug: string
  subCategory?: string | null
  investmentDate: string
  maturityDate?: string | null
  description?: string | null
  tags?: string[]
  investedAmount: number
  currency: string
  exchangeRate?: number
  feesAmount?: number
  paymentMethod?: string | null
  bankAccountId?: string | null
  referenceNo?: string | null
  // Expected returns
  expectedAnnualReturn?: number
  incomeTypes?: string[]
  paymentFrequency?: string | null
  expectedNextIncomeDate?: string | null
  expectedIncomeAmount?: number | null
  // Type-specific + documents + accounting
  details?: Record<string, unknown>
  documents?: Array<{ name: string; type?: string; url: string; date?: string; notes?: string }>
  autoGenerateVoucher?: boolean
}

// ---------------------------------------------------------------------------
// CREATE / UPDATE investment (with auto-voucher on create when posted)
// ---------------------------------------------------------------------------
export async function saveInvestment(input: InvestmentInput): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "You must be signed in." }

  // Basic validation.
  if (!input.name?.trim()) return { ok: false, error: "Investment name is required." }
  if (!input.investmentTypeId) return { ok: false, error: "Investment type is required." }
  if (!input.investmentDate) return { ok: false, error: "Investment date is required." }
  const invested = Number(input.investedAmount || 0)
  if (!(invested > 0)) return { ok: false, error: "Invested amount must be greater than zero." }

  // Resolve the asset account from the type's slug → asset account code.
  const assetCode = assetCodeForTypeSlug(input.typeSlug)
  const fees = Number(input.feesAmount || 0)
  const exchangeRate = Number(input.exchangeRate || 1)
  const currency = input.currency || "BDT"
  const bdtEquivalent = currency === "BDT" ? invested : invested * exchangeRate
  const costBasis = bdtEquivalent + fees

  try {
    return await directPrisma.$transaction(async (tx) => {
      const entryDate = new Date(input.investmentDate)
      const assetAccountId = await resolveAccountId(tx, assetCode)

      // Cash account — only required when we post a voucher (money moves).
      let cashAccountId: string | null = null
      if (input.autoGenerateVoucher !== false) {
        if (!input.bankAccountId && !input.paymentMethod) {
          // Allow draft creation without a cash account; we skip the voucher.
        }
        if (input.bankAccountId) {
          const ba = await tx.bankAccount.findUnique({
            where: { id: input.bankAccountId },
            select: { coaAccountId: true },
          })
          cashAccountId = ba?.coaAccountId ?? null
        }
        if (!cashAccountId) {
          // Fall back to CASH-IN-HAND for cash payment.
          cashAccountId = await resolveAccountId(tx, "CASH-IN-HAND")
        }
      }

      if (input.id) {
        // ── UPDATE ── (existing investment; re-post not supported here)
        const existing = await tx.investment.findUnique({ where: { id: input.id } })
        if (!existing) return { ok: false, error: "Investment not found." }
        if (existing.status !== "DRAFT") {
          return { ok: false, error: "Posted investments can't be edited. Record an exit or valuation instead." }
        }

        const updated = await tx.investment.update({
          where: { id: input.id },
          data: {
            name: input.name.trim(),
            investmentTypeId: input.investmentTypeId,
            subCategory: input.subCategory?.trim() || null,
            investmentDate: entryDate,
            maturityDate: input.maturityDate ? new Date(input.maturityDate) : null,
            description: input.description?.trim() || null,
            tags: input.tags ?? [],
            investedAmount: bdtEquivalent,
            currency,
            exchangeRate,
            bdtEquivalent,
            feesAmount: fees,
            costBasis,
            currentValue: Number(existing.currentValue) > 0 ? Number(existing.currentValue) : bdtEquivalent,
            expectedAnnualReturn: Number(input.expectedAnnualReturn || 0),
            incomeTypes: input.incomeTypes ?? [],
            paymentFrequency: input.paymentFrequency || null,
            expectedNextIncomeDate: input.expectedNextIncomeDate ? new Date(input.expectedNextIncomeDate) : null,
            expectedIncomeAmount: input.expectedIncomeAmount ?? null,
            debitAccountId: assetAccountId,
            creditAccountId: cashAccountId,
            paymentMethod: input.paymentMethod || null,
            bankAccountId: input.bankAccountId || null,
            referenceNo: input.referenceNo || null,
            details: (input.details ?? {}) as Prisma.InputJsonValue,
            documents: (input.documents ?? []) as Prisma.InputJsonValue,
            updatedBy: user.email,
            updatedById: user.id,
          },
        })

        await writeAuditLog(tx, {
          entityType: "INVESTMENT",
          entityId: updated.id,
          action: "UPDATE",
          summary: `Updated investment "${updated.name}"`,
          actor: user,
        })
        revalidateAll()
        return { ok: true, id: updated.id }
      }

      // ── CREATE ──
      const investmentNo = await nextInvestmentNo(tx, entryDate)
      const investment = await tx.investment.create({
        data: {
          investmentNo,
          name: input.name.trim(),
          investmentTypeId: input.investmentTypeId,
          subCategory: input.subCategory?.trim() || null,
          investmentDate: entryDate,
          maturityDate: input.maturityDate ? new Date(input.maturityDate) : null,
          description: input.description?.trim() || null,
          tags: input.tags ?? [],
          investedAmount: bdtEquivalent,
          currency,
          exchangeRate,
          bdtEquivalent,
          feesAmount: fees,
          costBasis,
          currentValue: bdtEquivalent,
          expectedAnnualReturn: Number(input.expectedAnnualReturn || 0),
          incomeTypes: input.incomeTypes ?? [],
          paymentFrequency: input.paymentFrequency || null,
          expectedNextIncomeDate: input.expectedNextIncomeDate ? new Date(input.expectedNextIncomeDate) : null,
          expectedIncomeAmount: input.expectedIncomeAmount ?? null,
          debitAccountId: assetAccountId,
          creditAccountId: cashAccountId,
          paymentMethod: input.paymentMethod || null,
          bankAccountId: input.bankAccountId || null,
          referenceNo: input.referenceNo || null,
          details: (input.details ?? {}) as Prisma.InputJsonValue,
          documents: (input.documents ?? []) as Prisma.InputJsonValue,
          status: "DRAFT",
          createdBy: user.email,
          createdById: user.id,
        },
      })

      // Optionally post the purchase voucher immediately and activate.
      let voucherNo: string | undefined
      if (input.autoGenerateVoucher !== false && cashAccountId) {
        const res = await postInvestmentPurchase(tx, {
          entryDate,
          narration: `Purchase of investment: ${investment.name} (${investmentNo})`,
          referenceNo: input.referenceNo || investmentNo,
          assetAccountId,
          cashAccountId,
          investedAmount: bdtEquivalent,
          feesAmount: fees,
          voucherType: "PAYMENT",
        })
        voucherNo = res.voucherNo
        await tx.investment.update({
          where: { id: investment.id },
          data: { journalEntryId: res.journalEntryId, status: "ACTIVE" },
        })
      }

      await writeAuditLog(tx, {
        entityType: "INVESTMENT",
        entityId: investment.id,
        action: "CREATE",
        summary: `Created investment "${investment.name}" (${investmentNo})${voucherNo ? ` · voucher ${voucherNo}` : ""}`,
        actor: user,
      })

      revalidateAll()
      return { ok: true, id: investment.id, voucherNo }
    })
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// RECORD INCOME
// ---------------------------------------------------------------------------
export interface InvestmentIncomeInput {
  investmentId: string
  incomeDate: string
  incomeType: "DIVIDEND" | "INTEREST" | "RENTAL" | "PROFIT_SHARE" | "OTHER"
  grossAmount: number
  tdsPercent?: number
  paymentMethod?: string | null
  bankAccountId?: string | null
  referenceNo?: string | null
  notes?: string | null
  autoGenerateVoucher?: boolean
}

export async function recordInvestmentIncome(input: InvestmentIncomeInput): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "You must be signed in." }
  if (!input.investmentId) return { ok: false, error: "Investment is required." }
  if (!input.incomeDate) return { ok: false, error: "Income date is required." }
  const gross = Number(input.grossAmount || 0)
  if (!(gross > 0)) return { ok: false, error: "Gross amount must be greater than zero." }

  const tdsPercent = Number(input.tdsPercent || 0)
  const tdsAmount = +((gross * tdsPercent) / 100).toFixed(2)
  const netAmount = +(gross - tdsAmount).toFixed(2)

  try {
    return await directPrisma.$transaction(async (tx) => {
      const investment = await tx.investment.findUnique({
        where: { id: input.investmentId },
        select: { id: true, name: true, investmentNo: true },
      })
      if (!investment) return { ok: false, error: "Investment not found." }

      let voucherNo: string | undefined
      let journalEntryId: string | undefined

      if (input.autoGenerateVoucher !== false) {
        // Resolve the cash account from bankAccountId → coaAccountId, else cash.
        let cashAccountId: string | null = null
        if (input.bankAccountId) {
          const ba = await tx.bankAccount.findUnique({
            where: { id: input.bankAccountId },
            select: { coaAccountId: true },
          })
          cashAccountId = ba?.coaAccountId ?? null
        }
        if (!cashAccountId) cashAccountId = await resolveAccountId(tx, "CASH-IN-HAND")

        const res = await postInvestmentIncome(tx, {
          entryDate: new Date(input.incomeDate),
          narration: `Investment income (${input.incomeType}) — ${investment.name} (${investment.investmentNo})`,
          referenceNo: input.referenceNo || investment.investmentNo,
          cashAccountId,
          incomeType: input.incomeType,
          grossAmount: gross,
          tdsAmount: tdsAmount,
        })
        voucherNo = res.voucherNo
        journalEntryId = res.journalEntryId
      }

      const row = await tx.investmentIncome.create({
        data: {
          investmentId: investment.id,
          incomeDate: new Date(input.incomeDate),
          incomeType: input.incomeType,
          grossAmount: gross,
          tdsPercent: tdsPercent,
          tdsAmount,
          netAmount,
          paymentMethod: input.paymentMethod || null,
          bankAccountId: input.bankAccountId || null,
          referenceNo: input.referenceNo || null,
          notes: input.notes || null,
          journalEntryId,
          createdBy: user.email,
          createdById: user.id,
        },
      })

      await writeAuditLog(tx, {
        entityType: "INVESTMENT",
        entityId: investment.id,
        action: "INCOME",
        summary: `Recorded ${input.incomeType} income of ৳${gross} (${investment.investmentNo})${voucherNo ? ` · ${voucherNo}` : ""}`,
        actor: user,
      })

      revalidateAll()
      return { ok: true, id: row.id, voucherNo }
    })
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// RECORD EXIT / DISPOSAL
// ---------------------------------------------------------------------------
export interface InvestmentExitInput {
  investmentId: string
  exitType: "FULL_EXIT" | "PARTIAL_EXIT" | "MATURED" | "WRITTEN_OFF"
  exitDate: string
  unitsSold?: number | null
  salePricePerUnit?: number | null
  proceeds?: number
  costBasisSold?: number
  capitalGainLoss?: number
  taxPercent?: number
  paymentMethod?: string | null
  bankAccountId?: string | null
  notes?: string | null
  autoGenerateVoucher?: boolean
}

export async function recordInvestmentExit(input: InvestmentExitInput): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "You must be signed in." }
  if (!input.exitDate) return { ok: false, error: "Exit date is required." }

  const proceeds = Number(input.proceeds || 0)
  const costBasisSold = Number(input.costBasisSold || 0)
  if (input.exitType !== "WRITTEN_OFF" && !(proceeds > 0)) {
    return { ok: false, error: "Sale proceeds must be greater than zero." }
  }

  // gain/loss: proceeds − cost basis
  const capitalGainLoss = input.exitType === "WRITTEN_OFF" ? -costBasisSold : Number((proceeds - costBasisSold).toFixed(2))
  const taxPercent = Number(input.taxPercent || 0)
  const taxAmount = +(Math.max(capitalGainLoss, 0) * (taxPercent / 100)).toFixed(2)
  const netProceeds = +(proceeds - taxAmount).toFixed(2)

  try {
    return await directPrisma.$transaction(async (tx) => {
      // B19: lock the Investment row so two concurrent exits can't both pass
      // the status check and post two disposal vouchers, double-crediting
      // cash / double-debiting the asset account.
      await lockRow(tx, "Investment", input.investmentId)
      const investment = await tx.investment.findUnique({
        where: { id: input.investmentId },
        select: {
          id: true, name: true, investmentNo: true, debitAccountId: true,
          costBasis: true, currentValue: true, investedAmount: true, status: true,
        },
      })
      if (!investment) return { ok: false, error: "Investment not found." }

      let voucherNo: string | undefined
      let journalEntryId: string | undefined

      if (input.exitType === "WRITTEN_OFF") {
        // Write off the full current value.
        const writeOffAmount = Number(investment.currentValue || investment.costBasis)
        const res = await postInvestmentWriteOff(tx, {
          entryDate: new Date(input.exitDate),
          narration: `Investment write-off — ${investment.name} (${investment.investmentNo})`,
          referenceNo: investment.investmentNo,
          assetAccountId: investment.debitAccountId,
          amount: writeOffAmount,
        })
        voucherNo = res.voucherNo
        journalEntryId = res.journalEntryId
        await tx.investment.update({
          where: { id: investment.id },
          data: { status: "WRITTEN_OFF", currentValue: 0 },
        })
      } else if (input.autoGenerateVoucher !== false) {
        let cashAccountId: string | null = null
        if (input.bankAccountId) {
          const ba = await tx.bankAccount.findUnique({
            where: { id: input.bankAccountId },
            select: { coaAccountId: true },
          })
          cashAccountId = ba?.coaAccountId ?? null
        }
        if (!cashAccountId) cashAccountId = await resolveAccountId(tx, "CASH-IN-HAND")

        const res = await postInvestmentExit(tx, {
          entryDate: new Date(input.exitDate),
          narration: `Exit (${input.exitType}) — ${investment.name} (${investment.investmentNo})`,
          referenceNo: investment.investmentNo,
          assetAccountId: investment.debitAccountId,
          cashAccountId,
          costBasisSold,
          netProceeds,
          capitalGainLoss,
          taxAmount: taxAmount,
        })
        voucherNo = res.voucherNo
        journalEntryId = res.journalEntryId

        // Update investment status + remaining value.
        const remainingValue = Math.max(Number(investment.currentValue) - costBasisSold, 0)
        const newStatus = input.exitType === "FULL_EXIT" || input.exitType === "MATURED" || remainingValue <= 0.005
          ? (input.exitType === "MATURED" ? "MATURED" : "FULLY_EXITED")
          : "PARTIALLY_EXITED"
        await tx.investment.update({
          where: { id: investment.id },
          data: { status: newStatus, currentValue: remainingValue },
        })
      }

      const row = await tx.investmentExit.create({
        data: {
          investmentId: investment.id,
          exitType: input.exitType,
          exitDate: new Date(input.exitDate),
          unitsSold: input.unitsSold ?? null,
          salePricePerUnit: input.salePricePerUnit ?? null,
          proceeds,
          costBasisSold,
          capitalGainLoss,
          taxPercent,
          taxAmount,
          netProceeds,
          paymentMethod: input.paymentMethod || null,
          bankAccountId: input.bankAccountId || null,
          notes: input.notes || null,
          journalEntryId,
          createdBy: user.email,
          createdById: user.id,
        },
      })

      await writeAuditLog(tx, {
        entityType: "INVESTMENT",
        entityId: investment.id,
        action: "EXIT",
        summary: `Recorded ${input.exitType} (${investment.investmentNo}) for ৳${proceeds}${voucherNo ? ` · ${voucherNo}` : ""}`,
        actor: user,
      })

      revalidateAll()
      return { ok: true, id: row.id, voucherNo }
    })
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// RECORD VALUATION
// ---------------------------------------------------------------------------
export interface ValuationInput {
  investmentId: string
  valuationDate: string
  marketValue: number
  method?: "MARKET" | "GOVT_RATE" | "APPRAISER"
  valuer?: string | null
  notes?: string | null
  createGainLossEntry?: boolean
}

export async function recordValuation(input: ValuationInput): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "You must be signed in." }
  if (!input.valuationDate) return { ok: false, error: "Valuation date is required." }
  if (!(Number(input.marketValue) > 0)) return { ok: false, error: "Market value must be greater than zero." }

  try {
    return await directPrisma.$transaction(async (tx) => {
      // B20: lock the Investment row so concurrent valuations can't race on
      // the running currentValue (the next valuation's changeAmount is
      // computed from the previous currentValue).
      await lockRow(tx, "Investment", input.investmentId)
      const investment = await tx.investment.findUnique({
        where: { id: input.investmentId },
        select: { id: true, name: true, investmentNo: true, currentValue: true },
      })
      if (!investment) return { ok: false, error: "Investment not found." }

      const previousValue = Number(investment.currentValue)
      const changeAmount = +(Number(input.marketValue) - previousValue).toFixed(2)

      const row = await tx.investmentValuation.create({
        data: {
          investmentId: investment.id,
          valuationDate: new Date(input.valuationDate),
          marketValue: Number(input.marketValue),
          method: input.method || "MARKET",
          valuer: input.valuer || null,
          notes: input.notes || null,
          createGainLossEntry: !!input.createGainLossEntry,
          changeAmount,
          createdBy: user.email,
          createdById: user.id,
        },
      })

      // Update the investment's running current value + last valuation date.
      await tx.investment.update({
        where: { id: investment.id },
        data: {
          currentValue: Number(input.marketValue),
          lastValuationDate: new Date(input.valuationDate),
        },
      })

      await writeAuditLog(tx, {
        entityType: "INVESTMENT",
        entityId: investment.id,
        action: "VALUATION",
        summary: `New valuation ৳${input.marketValue} (${changeAmount >= 0 ? "+" : ""}${changeAmount}) — ${investment.investmentNo}`,
        actor: user,
      })

      revalidateAll()
      return { ok: true, id: row.id }
    })
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// DELETE (drafts only)
// ---------------------------------------------------------------------------
export async function deleteInvestmentDraft(id: string): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "You must be signed in." }

  try {
    const investment = await prisma.investment.findUnique({
      where: { id },
      select: { id: true, status: true, journalEntryId: true, name: true, investmentNo: true },
    })
    if (!investment) return { ok: false, error: "Investment not found." }
    if (investment.status !== "DRAFT" || investment.journalEntryId) {
      return { ok: false, error: "Posted investments can't be deleted — record an exit instead." }
    }

    await prisma.investment.delete({ where: { id } })
    await prisma.entityAuditLog.create({
      data: {
        entityType: "INVESTMENT",
        investmentId: id,
        action: "DELETE",
        summary: `Deleted draft investment "${investment.name}" (${investment.investmentNo})`,
        actorUserId: user.id,
        actorName: user.email,
      },
    })
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// INVESTMENT ↔ PROJECT LINKING
// ---------------------------------------------------------------------------
export async function linkInvestmentProject(args: {
  investmentId: string
  projectId: string
  relationshipType?: "FUNDS_PROJECT" | "MANAGES_ASSET"
  relationshipNote?: string | null
}): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "You must be signed in." }

  try {
    const link = await prisma.investmentProjectLink.create({
      data: {
        investmentId: args.investmentId,
        projectId: args.projectId,
        relationshipType: args.relationshipType || "FUNDS_PROJECT",
        relationshipNote: args.relationshipNote || null,
        linkedById: user.id,
        linkedByName: user.email,
      },
    })
    await prisma.entityAuditLog.create({
      data: {
        entityType: "INVESTMENT",
        investmentId: args.investmentId,
        action: "LINK",
        summary: `Linked to project`,
        actorUserId: user.id,
        actorName: user.email,
      },
    })
    revalidateAll()
    return { ok: true, id: link.id }
  } catch (e) {
    // P2002 = unique-constraint violation (investment/project pair already linked).
    if ((e as { code?: string }).code === "P2002") {
      return { ok: false, error: "This investment and project are already linked." }
    }
    return { ok: false, error: (e as Error).message }
  }
}

export async function unlinkInvestmentProject(linkId: string): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "You must be signed in." }

  try {
    // Capture the link before deleting so we can record an UNLINK audit entry
    // on the investment (the link's owning entity).
    const link = await prisma.investmentProjectLink.findUnique({
      where: { id: linkId },
      select: { investmentId: true, projectId: true },
    })
    await prisma.investmentProjectLink.delete({ where: { id: linkId } })
    if (link) {
      await prisma.entityAuditLog.create({
        data: {
          entityType: "INVESTMENT",
          investmentId: link.investmentId,
          action: "UNLINK",
          summary: `Unlinked from project`,
          actorUserId: user.id,
          actorName: user.email,
        },
      })
    }
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// Re-export the income-code resolver for client preview convenience.
export { incomeCodeForType }
