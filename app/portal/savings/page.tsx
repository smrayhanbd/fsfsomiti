import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import MySavingsClient from "./MySavingsClient"
import { plain } from "@/lib/serialize"

export const dynamic = "force-dynamic"

/**
 * Member-portal "My Savings" page — the member's savings dashboard.
 *
 * Renders the stat cards (current balance / total deposited / total
 * withdrawn) and the full transaction history, plus a printable all-time
 * savings statement (revealed via the browser's print dialog).
 *
 * Former siblings that used to be tabs on this page now live on their own
 * routes:
 *   - Withdrawal requests  → /portal/withdrawal-request
 *   - Ledger statement     → /portal/ledger
 *   - Money receipts       → /portal/receipts
 *
 * Server component responsibilities:
 *   - guard auth (MEMBER only)
 *   - load the member + their savings rows joined to the GL mirror Transaction
 *     so the history table can fall back to the voucher number
 */
export default async function MySavingsPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user || session.user.role !== "MEMBER") {
    redirect("/")
  }

  const memberId = session.user.id

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      memberNo: true,
      fullName: true,
      savings: {
        orderBy: { date: "desc" },
        include: {
          // GL mirror Transaction — gives the history table the voucherNo
          // fallback for rows without a legacy receiptNo.
          transactionMirror: {
            select: {
              id: true,
              voucherNo: true,
              status: true,
              transactionType: true,
              paymentMethod: true,
              referenceNo: true,
              remarks: true,
              chargeTypeName: true,
              breakdown: true,
              transactionDate: true,
              approvedAt: true,
            },
          },
        },
      },
      organization: { select: { name: true } },
    },
  })

  if (!member) redirect("/portal")

  // All-time totals — used by the stat cards + printable statement.
  const totalDeposit = member.savings
    .filter((s) => s.type !== "WITHDRAWAL")
    .reduce((acc, s) => acc + Number(s.amount), 0)
  const totalWithdrawal = member.savings
    .filter((s) => s.type === "WITHDRAWAL")
    .reduce((acc, s) => acc + Number(s.amount), 0)
  const currentBalance = totalDeposit - totalWithdrawal

  return (
    <div className="space-y-6">
      {/* On-screen header (hidden when printing the statement) */}
      <div className="portal-no-print flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            My Savings &amp; Transactions
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            View your balance and complete transaction history.
          </p>
        </div>
      </div>

      <MySavingsClient
        member={plain({
          memberNo: member.memberNo,
          fullName: member.fullName,
          currentBalance,
          totalDeposit,
          totalWithdrawal,
        })}
        savings={plain(member.savings)}
        orgName={member.organization?.name || "Future Savings Foundation"}
      />
    </div>
  )
}
