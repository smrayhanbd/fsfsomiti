import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser, isSuperAdmin } from "@/lib/permissions"
import BankAccountsClient from "./BankAccountsClient"
import type { PaymentMethod } from "@/lib/transactions/types"

export const dynamic = "force-dynamic"

/**
 * Somiti Settings → Active Bank Accounts.
 *
 * Each BankAccount maps a Collection Method (Cash / Bank / Mobile) to the COA
 * Account that should receive deposits made via that method. The Deposit form
 * reads the default BankAccount for the chosen method to auto-select the
 * "Received COA", so configuring one default per group here is what powers the
 * auto-mapping on /dashboard/transactions/deposits.
 */
export default async function BankAccountsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  if (!isSuperAdmin(user)) redirect("/dashboard")

  const [bankAccounts, accounts] = await Promise.all([
    prisma.bankAccount.findMany({
      include: { coaAccount: { select: { id: true, accountCode: true, accountName: true } } },
      orderBy: [{ paymentMethod: "asc" }, { isDefault: "desc" }, { accountName: "asc" }],
    }),
    prisma.account.findMany({
      where: { status: "ACTIVE", allowPosting: true },
      select: { id: true, accountCode: true, accountName: true, accountType: true, isCash: true, isBank: true },
      orderBy: { accountCode: "asc" },
    }),
  ])

  return (
    <BankAccountsClient
      bankAccounts={bankAccounts.map((b) => ({
        id: b.id,
        accountName: b.accountName,
        bankName: b.bankName,
        accountNumber: b.accountNumber,
        branch: b.branch,
        paymentMethod: b.paymentMethod as PaymentMethod,
        coaAccountId: b.coaAccountId,
        coaAccountCode: b.coaAccount.accountCode,
        coaAccountName: b.coaAccount.accountName,
        isActive: b.isActive,
        isDefault: b.isDefault,
      }))}
      accounts={accounts.map((a) => ({
        id: a.id,
        accountCode: a.accountCode,
        accountName: a.accountName,
        accountType: a.accountType as "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE",
        isCash: a.isCash,
        isBank: a.isBank,
      }))}
    />
  )
}
