import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import { calculateDues } from "@/lib/dueCalculator"
import {
  getDefaultCoasForAllGroups,
  missingGroups,
} from "@/lib/transactions/bankAccounts"
import DepositForm from "./DepositForm"

export const dynamic = "force-dynamic"

export default async function DepositTransactionsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")

  // We need the MEMBER-SAVINGS-LIABILITY account name for the live journal
  // preview (the Cr leg of every deposit posting).
  const memberSavingsLiability = await prisma.account.findUnique({
    where: { accountCode: "MEMBER-SAVINGS-LIABILITY" },
    select: { id: true, accountCode: true, accountName: true },
  })

  const [members, accounts, collectionTypes, feeSetups, defaultCoas] = await Promise.all([
    // Members with their savings rows — needed for the live total-deposit and
    // due-balance figures on the right-hand member card.
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
        membershipDate: true,
        createdAt: true,
        savings: { select: { type: true, amount: true, date: true } },
      },
      orderBy: { memberNo: "asc" },
    }),
    // Active postable accounts — used by the COA override dropdown.
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
    // Only ACTIVE collection types (Fees & Charge Setup → Collection Type tab).
    prisma.chargeType.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // Every FeeSetup — consumed by calculateDues() for expected-vs-paid math.
    prisma.feeSetup.findMany(),
    // Default Received-COA per payment-method group (Cash / Bank / Mobile).
    getDefaultCoasForAllGroups(),
  ])

  // Pre-compute each member's financial summary server-side so the client form
  // stays pure (no prisma imports, no Decimal serialization headaches).
  const membersWithSummary = members.map((m) => {
    const dues = calculateDues(
      m.id,
      m.membershipDate ?? m.createdAt,
      feeSetups,
      m.savings.map((s) => ({ type: s.type, amount: s.amount, date: s.date }))
    )
    const deposits = m.savings.filter((s) => s.type !== "WITHDRAWAL")
    const totalDeposits = deposits.reduce((acc, s) => acc + Number(s.amount), 0)
    // Most recent non-withdrawal savings row, if any.
    const lastDepositRow = deposits.length
      ? deposits.reduce((latest, s) => (s.date > latest.date ? s : latest))
      : null

    return {
      id: m.id,
      memberNo: m.memberNo,
      fullName: m.fullName,
      phone: m.phone,
      photoUrl: m.photoUrl,
      gender: m.gender,
      status: m.status,
      dueBalance: dues.totalDue,
      lateFines: dues.totalFines,
      totalDeposits,
      lastDeposit: lastDepositRow
        ? { amount: Number(lastDepositRow.amount), date: lastDepositRow.date.toISOString() }
        : null,
    }
  })

  return (
    <DepositForm
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
      collectionTypes={collectionTypes.map((c) => ({ id: c.id, name: c.name }))}
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
