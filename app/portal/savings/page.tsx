import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import MySavingsClient from "./MySavingsClient"
import { getOrganization } from "@/lib/organization"
import { plain } from "@/lib/serialize"

export const dynamic = "force-dynamic"

/**
 * Member-portal "My Savings" page — the single hub for everything savings-related.
 *
 * The page is split into three client-side tabs:
 *
 *   1. Savings Dashboard — stat cards + withdrawal requests + transaction history
 *      (the original /portal/savings experience).
 *   2. View Ledger       — a date-range picker that generates an on-screen
 *                          running-balance statement (re-using the same
 *                          `LedgerPrintStatement` component the admin member-ledger
 *                          page uses) plus a "Download PDF" button that hits
 *                          /api/portal/statement/ledger.
 *   3. Money Receipts    — a list of the member's APPROVED DEPOSIT / WITHDRAWAL
 *                          transactions with a per-row "Download PDF" button
 *                          that hits /api/portal/transactions/[id]/receipt.
 *
 * Server component responsibilities:
 *   - guard auth (MEMBER only)
 *   - load the member + their savings rows joined to the GL mirror Transaction
 *     so the client can render the dashboard history, the ledger statement,
 *     and the per-row receipt buttons in one round-trip
 *   - load the active bank / mobile accounts (CASH excluded) so the "future
 *     deposits" reference block on the Money Receipt PDF (built in
 *     buildReceiptPayload.ts) doesn't need a second fetch
 *   - load org branding for the printable ledger statement
 */
export default async function MySavingsPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user || session.user.role !== "MEMBER") {
    redirect("/")
  }

  const memberId = session.user.id

  const [member, org] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      include: {
        // Savings rows are shared across all three tabs:
        //   - Dashboard history (newest-first)
        //   - View Ledger statement (oldest-first, with running balance)
        //   - Money Receipts list (filter for eligible APPROVED DEPOSIT/WITHDRAWAL)
        // So we load them once with the GL mirror Transaction included — that
        // gives the client everything it needs without a second round-trip.
        savings: {
          orderBy: { date: "desc" },
          include: {
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
        // Withdrawal requests — shown on the Dashboard tab.
        requests: {
          where: { type: "WITHDRAWAL" },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        organization: true,
        // Current address — used by the printable ledger statement header.
        addresses: {
          where: { addressType: "CURRENT" },
          select: {
            village: true,
            postOffice: true,
            policeStation: true,
            district: true,
            postalCode: true,
          },
          take: 1,
        },
      },
    }),
    getOrganization(),
  ])

  if (!member) redirect("/portal")

  // All-time totals — used by the Dashboard tab's stat cards.
  const totalDeposit = member.savings
    .filter((s) => s.type !== "WITHDRAWAL")
    .reduce((acc, s) => acc + Number(s.amount), 0)
  const totalWithdrawal = member.savings
    .filter((s) => s.type === "WITHDRAWAL")
    .reduce((acc, s) => acc + Number(s.amount), 0)
  const currentBalance = totalDeposit - totalWithdrawal

  // Earliest savings date — used as the default "from" filter on the View Ledger tab.
  const savingsAsc = [...member.savings].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )
  const earliestDate = (savingsAsc[0]?.date ?? member.membershipDate ?? new Date()).toISOString()

  // Single-line address for the printable ledger statement header.
  const a = member.addresses[0]
  const address = a
    ? [a.village, a.postOffice, a.policeStation, a.district, a.postalCode]
        .filter(Boolean)
        .join(", ") || null
    : null

  return (
    <div className="space-y-6">
      {/* On-screen header (hidden when printing the ledger statement) */}
      <div className="portal-no-print flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            My Savings &amp; Transactions
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            View your balance, generate a ledger statement, or download a money-receipt voucher.
          </p>
        </div>
      </div>

      <MySavingsClient
        member={plain({
          id: member.id,
          memberNo: member.memberNo,
          fullName: member.fullName,
          phone: member.phone,
          email: member.email,
          membershipDate: member.membershipDate,
          address,
          currentBalance,
          totalDeposit,
          totalWithdrawal,
          earliestDate,
        })}
        savings={plain(member.savings)}
        requests={plain(member.requests)}
        orgName={member.organization?.name || "Future Savings Foundation"}
        org={org}
      />
    </div>
  )
}
