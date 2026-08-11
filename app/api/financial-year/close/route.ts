import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { directPrisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { getCurrentUser, isSuperAdmin } from "@/lib/permissions"
import { nextVoucherNo } from "@/lib/accounting"
import type { AccountType } from "@/lib/accounting"

export const dynamic = "force-dynamic"

/**
 * POST /api/financial-year/close
 *
 * Closes a FinancialYear by:
 *   1. Validating the year is OPEN and its endDate has passed.
 *   2. Inside a transaction, posting a year-end JournalEntry that:
 *        - Debits each INCOME account (zeroes them out)
 *        - Credits each EXPENSE account (zeroes them out)
 *        - Credits/Debits a "Retained Earnings" account for the net income.
 *   3. Updating the FinancialYear row to status="CLOSED", closedById, closedAt.
 *
 * Body: { yearId: string }
 * Returns: { journalEntryId, netIncome }
 *
 * Auth: SUPER_ADMIN only — closing a year is a high-impact financial action.
 */
export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // Year-close is restricted to SUPER_ADMIN — even an ADMIN with
  // TRANSACTION_APPROVE permission shouldn't be able to close a year.
  if (!isSuperAdmin(user)) {
    return NextResponse.json(
      { error: "Only the Super Admin can close a financial year." },
      { status: 403 }
    )
  }

  // ── Body parse ───────────────────────────────────────────────────────────
  let body: { yearId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const yearId = body.yearId
  if (!yearId) {
    return NextResponse.json({ error: "yearId is required" }, { status: 400 })
  }

  try {
    const result = await directPrisma.$transaction(
      async (tx) => {
        // ── 1. Load + validate the year ───────────────────────────────────
        const year = await tx.financialYear.findUnique({ where: { id: yearId } })
        if (!year) throw new Error("Financial year not found.")
        if (year.status !== "OPEN") {
          throw new Error(`Cannot close a year that is ${year.status}.`)
        }
        // The year's endDate must have passed (we don't allow mid-year close).
        const now = new Date()
        if (year.endDate.getTime() > now.getTime()) {
          throw new Error(
            "Cannot close a financial year before its end date has passed."
          )
        }

        // ── 2. Resolve period balances per account ───────────────────────
        // Use the year's [startDate, endDate] window. endDate is a DATE
        // column (midnight UTC); extend to end-of-day for the journal filter.
        const periodEnd = new Date(year.endDate)
        periodEnd.setHours(23, 59, 59, 999)

        const accounts = await tx.account.findMany({
          where: { status: "ACTIVE" },
          select: {
            id: true,
            accountCode: true,
            accountName: true,
            accountType: true,
            nature: true,
            journalLines: {
              where: {
                journalEntry: {
                  status: "POSTED",
                  entryDate: { gte: year.startDate, lte: periodEnd },
                },
              },
              select: { debit: true, credit: true },
            },
          },
        })

        // Compute the net movement per income/expense account.
        const closable = accounts
          .filter((a) => a.accountType === "INCOME" || a.accountType === "EXPENSE")
          .map((a) => {
            let d = 0
            let c = 0
            for (const l of a.journalLines) {
              d += Number(l.debit ?? 0)
              c += Number(l.credit ?? 0)
            }
            // Natural balance for the period — same convention as the
            // financial statements engine.
            const natural = a.nature === "DEBIT" ? d - c : c - d
            return { ...a, natural }
          })
          .filter((a) => Math.abs(a.natural) > 0.005)

        if (closable.length === 0) {
          // No income/expense to close — just mark the year closed.
          const updated = await tx.financialYear.update({
            where: { id: yearId },
            data: {
              status: "CLOSED",
              closedById: user.id,
              closedAt: now,
            },
          })
          return {
            journalEntryId: null,
            netIncome: 0,
            yearId: updated.id,
          }
        }

        // ── 3. Resolve "Retained Earnings" account ──────────────────────
        // Look up by code 3500 (industry-standard retained-earnings code) or
        // by name "Retained Earnings". If neither exists, fall back to the
        // first EQUITY account.
        const retained =
          (await tx.account.findUnique({ where: { accountCode: "3500" } })) ||
          (await tx.account.findFirst({
            where: { accountName: { contains: "Retained Earnings", mode: "insensitive" } },
          })) ||
          (await tx.account.findFirst({
            where: { accountType: "EQUITY", status: "ACTIVE" },
          }))
        if (!retained) {
          throw new Error(
            "No Retained Earnings account (code 3500 / name 'Retained Earnings' / EQUITY) found. Create one before closing the year."
          )
        }

        // ── 4. Build the year-end JournalEntry ───────────────────────────
        // To "zero out" each income/expense account, we post the OPPOSITE
        // of its natural balance against Retained Earnings:
        //   - INCOME (credit-natured, positive balance): DEBIT income, CREDIT retained
        //   - EXPENSE (debit-natured, positive balance): CREDIT expense, DEBIT retained
        // The net debit/credit to Retained Earnings = net income.
        const voucherNo = await nextVoucherNo("JOURNAL", tx)
        const entry = await tx.journalEntry.create({
          data: {
            voucherNo,
            voucherType: "JOURNAL",
            entryDate: periodEnd,
            narration: `Year-end closing entry for ${year.name}`,
            referenceNo: year.name,
            status: "POSTED",
            totalDebit: 0, // updated below
            totalCredit: 0, // updated below
            financialYearId: year.id,
          },
        })

        let totalDebit = 0
        let totalCredit = 0
        let netIncome = 0

        for (const a of closable) {
          if (a.accountType === "INCOME") {
            // Income has a credit balance → debit it to zero it out.
            await tx.journalLine.create({
              data: {
                journalEntryId: entry.id,
                accountId: a.id,
                debit: a.natural,
                credit: 0,
                memo: `Year-end close — ${a.accountName}`,
              },
            })
            totalDebit += a.natural
          } else {
            // Expense has a debit balance → credit it to zero it out.
            await tx.journalLine.create({
              data: {
                journalEntryId: entry.id,
                accountId: a.id,
                debit: 0,
                credit: a.natural,
                memo: `Year-end close — ${a.accountName}`,
              },
            })
            totalCredit += a.natural
          }
        }

        // The plug line goes to Retained Earnings. The amount is the
        // difference; the side depends on whether the year was profitable.
        //   netIncome = income − expense = totalDebit (income zeroed) −
        //                                   totalCredit (expense zeroed)
        // Wait — income's credit balance becomes a DEBIT on close; expense's
        // debit balance becomes a CREDIT on close. So:
        //   incomeClosingDebits − expenseClosingCredits = netIncome
        // For the entry to balance, Retained Earnings gets the offset:
        //   if netIncome > 0  → CREDIT retained (income > expense, profit)
        //   if netIncome < 0  → DEBIT retained (loss)
        netIncome = totalDebit - totalCredit
        if (netIncome > 0) {
          // Profit → credit retained.
          await tx.journalLine.create({
            data: {
              journalEntryId: entry.id,
              accountId: retained.id,
              debit: 0,
              credit: netIncome,
              memo: `Year-end close — Retained Earnings (net income for ${year.name})`,
            },
          })
          totalCredit += netIncome
        } else if (netIncome < 0) {
          // Loss → debit retained.
          const abs = Math.abs(netIncome)
          await tx.journalLine.create({
            data: {
              journalEntryId: entry.id,
              accountId: retained.id,
              debit: abs,
              credit: 0,
              memo: `Year-end close — Retained Earnings (net loss for ${year.name})`,
            },
          })
          totalDebit += abs
        }

        // Update the entry's totals.
        await tx.journalEntry.update({
          where: { id: entry.id },
          data: { totalDebit, totalCredit },
        })

        // ── 5. Update each closed account's balance ──────────────────────
        // The journal lines above already mutate Account.currentBalance via
        // the posting engine (lib/transactions/posting.ts) when they are
        // tagged as POSTED — but here we wrote them via direct prisma
        // create, so the balances need to be updated manually. For each
        // income/expense account, set currentBalance to 0 (the closing entry
        // negates its natural balance).
        for (const a of closable) {
          await tx.account.update({
            where: { id: a.id },
            data: { currentBalance: 0 },
          })
        }
        // Retained Earnings gets the net income added.
        const retainedBalance = Number(retained.currentBalance ?? 0) + netIncome
        await tx.account.update({
          where: { id: retained.id },
          data: { currentBalance: retainedBalance },
        })

        // ── 6. Mark the year closed ──────────────────────────────────────
        const updated = await tx.financialYear.update({
          where: { id: yearId },
          data: {
            status: "CLOSED",
            closedById: user.id,
            closedAt: now,
          },
        })

        return {
          journalEntryId: entry.id,
          netIncome,
          yearId: updated.id,
        }
      },
      { maxWait: 15_000, timeout: 30_000 }
    )

    return NextResponse.json(result)
  } catch (e) {
    console.error("[/api/financial-year/close] failed:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Close failed" },
      { status: 500 }
    )
  }
}

// Unused import guard — kept so the type is exported from this module's
// surface even if a future refactor inlines the function.
export type { AccountType }
