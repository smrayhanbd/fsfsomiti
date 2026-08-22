import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import ReceiptsClient from "./ReceiptsClient"
import { plain } from "@/lib/serialize"

export const dynamic = "force-dynamic"

/**
 * Member-portal "Money Receipt" page — under the View Reports menu.
 *
 * This used to be the "Money Receipts" tab on /portal/savings. It lists the
 * member's APPROVED DEPOSIT / WITHDRAWAL transactions with a per-row
 * "View Receipt" button that opens /portal/receipts/[transactionId] (the
 * printable money-receipt voucher, rendered by the same MoneyReceipt
 * component the admin panel uses).
 *
 * Server component responsibilities:
 *   - guard auth (MEMBER only)
 *   - load the member's savings rows joined to the GL mirror Transaction
 *     so the client can filter receipt-eligible (APPROVED DEPOSIT/WITHDRAWAL)
 *     rows and link to the voucher by mirror id
 */
export default async function MoneyReceiptPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user || session.user.role !== "MEMBER") {
    redirect("/")
  }

  const member = await prisma.member.findUnique({
    where: { id: session.user.id },
    select: {
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
    },
  })

  if (!member) redirect("/portal")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Money Receipt
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          View and print money-receipt vouchers for your approved deposits and withdrawals.
        </p>
      </div>

      <ReceiptsClient savings={plain(member.savings)} />
    </div>
  )
}
