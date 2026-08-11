import { LoanStatus } from "@prisma/client"
import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import {
  getDefaultCoasForAllGroups,
  missingGroups,
} from "@/lib/transactions/bankAccounts"
import WithdrawalForm from "./WithdrawalForm"

export const dynamic = "force-dynamic"

// Loan statuses that carry an outstanding balance the member still owes.
const ACTIVE_LOAN_STATUSES: LoanStatus[] = ["DISBURSED", "DEFAULTED"]

export default async function WithdrawalTransactionsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")

  // We need the MEMBER-SAVINGS-LIABILITY account name for the live journal
  // preview (the Dr leg of every withdrawal posting).
  const memberSavingsLiability = await prisma.account.findUnique({
    where: { accountCode: "MEMBER-SAVINGS-LIABILITY" },
    select: { id: true, accountCode: true, accountName: true },
  })

  const [members, accounts, defaultCoas] = await Promise.all([
    // Members with their savings rows (balance math) and active loans
    // (outstanding balance) — needed for the right-hand member card.
    prisma.member.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        memberNo: true,
        fullName: true,
        phone: true,
        photoUrl: true,
        gender: true,
        status: true,
        savings: { select: { type: true, amount: true, date: true } },
        loans: {
          where: { status: { in: ACTIVE_LOAN_STATUSES } },
          select: { outstandingBalance: true },
        },
      },
      orderBy: { memberNo: "asc" },
    }),
    // Active postable accounts — used by the Source Bank Account dropdown.
    prisma.account.findMany({
      where: { status: "ACTIVE", allowPosting: true },
      select: {
        id: true,
        accountCode: true,
        accountName: true,
        accountType: true,
        isCash: true,
        isBank: true,
        currentBalance: true,
      },
      orderBy: { accountCode: "asc" },
    }),
    // Default COA per payment-method group (Cash / Bank / Mobile). Withdrawals
    // are bank-only per spec §7, but we resolve all groups for parity with the
    // deposit form and future-proofing.
    getDefaultCoasForAllGroups(),
  ])

  // Pre-compute each member's financial summary server-side so the client form
  // stays pure (no prisma imports, no Decimal serialization headaches).
  const membersWithSummary = members.map((m) => {
    const deposits = m.savings.filter((s) => s.type !== "WITHDRAWAL")
    const withdrawals = m.savings.filter((s) => s.type === "WITHDRAWAL")
    const totalDeposits = deposits.reduce((acc, s) => acc + Number(s.amount), 0)
    const totalWithdrawn = withdrawals.reduce((acc, s) => acc + Number(s.amount), 0)
    const loanBalance = m.loans.reduce((acc, l) => acc + Number(l.outstandingBalance), 0)
    // Most recent withdrawal row, if any.
    const lastWithdrawalRow = withdrawals.length
      ? withdrawals.reduce((latest, s) => (s.date > latest.date ? s : latest))
      : null

    return {
      id: m.id,
      memberNo: m.memberNo,
      fullName: m.fullName,
      phone: m.phone,
      photoUrl: m.photoUrl,
      gender: m.gender,
      status: m.status,
      availableBalance: totalDeposits - totalWithdrawn,
      totalWithdrawn,
      loanBalance,
      lastWithdrawal: lastWithdrawalRow
        ? { amount: Number(lastWithdrawalRow.amount), date: lastWithdrawalRow.date.toISOString() }
        : null,
    }
  })

  return (
    <WithdrawalForm
      members={membersWithSummary}
      accounts={accounts.map((a) => ({
        id: a.id,
        accountCode: a.accountCode,
        accountName: a.accountName,
        accountType: a.accountType as "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE",
        isCash: a.isCash,
        isBank: a.isBank,
        currentBalance: Number(a.currentBalance),
      }))}
      defaultCoas={defaultCoas.map((d) => ({
        group: d.group,
        paymentMethod: d.paymentMethod,
        bankAccountId: d.bankAccountId,
        coaAccountId: d.coaAccountId,
        coaAccountCode: d.coaAccountCode,
        coaAccountName: d.coaAccountName,
        missing: d.missing,
      }))}
      missingGroups={missingGroups(defaultCoas)}
      memberSavingsLiability={
        memberSavingsLiability
          ? {
              id: memberSavingsLiability.id,
              accountCode: memberSavingsLiability.accountCode,
              accountName: memberSavingsLiability.accountName,
            }
          : null
      }
    />
  )
}
