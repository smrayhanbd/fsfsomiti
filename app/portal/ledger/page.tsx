import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import LedgerClient from "./LedgerClient"
import { getOrganization } from "@/lib/organization"
import { plain } from "@/lib/serialize"

export const dynamic = "force-dynamic"

/**
 * Member-portal "View Ledger" page — under the View Reports menu.
 *
 * This used to be the "View Ledger" tab on /portal/savings. It renders a
 * date-range filter that generates an on-screen running-balance statement
 * (re-using the same `LedgerPrintStatement` component the admin member-ledger
 * page uses), plus Export CSV and browser-native Print / Save as PDF.
 *
 * Server component responsibilities:
 *   - guard auth (MEMBER only)
 *   - load the member + their savings rows joined to the GL mirror Transaction
 *     (oldest-first running balance needs remarks / reference / voucher data)
 *   - load the current address (printable statement header) + org branding
 */
export default async function LedgerPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user || session.user.role !== "MEMBER") {
    redirect("/")
  }

  const memberId = session.user.id

  const [member, org] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      select: {
        memberNo: true,
        fullName: true,
        phone: true,
        email: true,
        membershipDate: true,
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

  // Earliest savings date — the default "from" filter.
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
      <div className="ledger-no-print">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          View Ledger
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Generate a running-balance ledger statement for any date range, then print or export it.
        </p>
      </div>

      <LedgerClient
        member={plain({
          memberNo: member.memberNo,
          fullName: member.fullName,
          phone: member.phone,
          email: member.email,
          address,
          earliestDate,
        })}
        savings={plain(member.savings)}
        org={org}
      />
    </div>
  )
}
