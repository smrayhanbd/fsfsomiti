import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import WithdrawalRequestClient from "./WithdrawalRequestClient"
import { plain } from "@/lib/serialize"

export const dynamic = "force-dynamic"

/**
 * Member-portal "Withdrawal Request" page.
 *
 * The withdrawal request form used to live in a dialog on the savings
 * dashboard; it now has its own page under the "Deposit & Withdrawal" menu
 * (next to Deposit Request). Submissions go through the same
 * submitWithdrawalRequest server action — the request lands in the admin
 * approval queue, and the action redirects back here so the member sees
 * their new request in the recent-requests feed.
 *
 * Server component responsibilities:
 *   - guard auth (MEMBER only)
 *   - compute the member's withdrawable balance for the form's guard rail
 *   - load the 5 most recent withdrawal requests for the status feed
 */
export default async function WithdrawalRequestPage() {
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
      savings: { select: { type: true, amount: true } },
      requests: {
        where: { type: "WITHDRAWAL" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          amount: true,
          createdAt: true,
          method: true,
          notes: true,
          status: true,
        },
      },
    },
  })

  if (!member) redirect("/portal")

  // Withdrawable balance — same calculation as submitWithdrawalRequest.
  const totalDeposit = member.savings
    .filter((s) => s.type !== "WITHDRAWAL")
    .reduce((acc, s) => acc + Number(s.amount), 0)
  const totalWithdrawal = member.savings
    .filter((s) => s.type === "WITHDRAWAL")
    .reduce((acc, s) => acc + Number(s.amount), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Withdrawal Request
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Submit a withdrawal request for admin approval. Approved amounts are paid out via bank transfer or cheque.
        </p>
      </div>

      <WithdrawalRequestClient
        member={plain({
          id: member.id,
          memberNo: member.memberNo,
          fullName: member.fullName,
          currentBalance: totalDeposit - totalWithdrawal,
        })}
        requests={plain(member.requests)}
      />
    </div>
  )
}
