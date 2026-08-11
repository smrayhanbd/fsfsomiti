import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getDefaultCoasForAllGroups, missingGroups } from "@/lib/transactions/bankAccounts"
import DepositRequestClient from "./DepositRequestClient"

export const dynamic = "force-dynamic"

/**
 * Member-portal "Deposit Request" page.
 *
 * Members who have already deposited money to the Somiti's bank / mobile / cash
 * account come here to submit a deposit request with the deposit slip / txn
 * document attached as proof. The request goes to the admin approval queue;
 * on approval the existing approveTransaction flow credits the member's
 * deposit balance and auto-generates the money-receipt PDF (same as a direct
 * admin deposit entry).
 *
 * Server component responsibilities:
 *   - guard auth (MEMBER only)
 *   - load the active collection types (ChargeType) the member can pick from
 *   - load the active bank accounts so we can show "deposit to" instructions
 *   - load the member's recent deposit requests so the page can render a
 *     status feed without a second round-trip
 */
export default async function DepositRequestPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") redirect("/")

  const memberId = session.user.id

  const [member, collectionTypes, bankAccounts, defaultCoas, recentRequests] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        memberNo: true,
        fullName: true,
        phone: true,
        email: true,
        status: true,
        savings: { select: { type: true, amount: true } },
      },
    }),
    // Active collection types — same list shown on the admin Deposit form.
    prisma.chargeType.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // Active bank/mobile accounts — shown read-only so the member knows where
    // to send money before submitting the request.
    prisma.bankAccount.findMany({
      where: { isActive: true },
      select: {
        id: true,
        accountName: true,
        bankName: true,
        accountNumber: true,
        branch: true,
        paymentMethod: true,
        isDefault: true,
      },
      orderBy: [{ paymentMethod: "asc" }, { isDefault: "desc" }, { accountName: "asc" }],
    }),
    // Default-COA map — used to warn the member if the Somiti hasn't configured
    // a receiving account for the chosen method (the admin will still need to
    // resolve it before approval).
    getDefaultCoasForAllGroups(),
    // Member's most recent 10 deposit requests — newest first. We include the
    // linked Transaction so the page can show the returnReason + status from
    // the engine side (MemberRequest.status for DEPOSIT mirrors the linked
    // Transaction.status, but the returnReason lives on the Transaction).
    prisma.memberRequest.findMany({
      where: { memberId, type: "DEPOSIT" },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        transactions: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            voucherNo: true,
            returnReason: true,
            rejectionReason: true,
          },
        },
      },
    }),
  ])

  if (!member) redirect("/portal")

  // Total deposited so far — same calculation as the savings page (excludes
  // WITHDRAWAL rows). Shown as a reassurance card so the member sees their
  // current balance before requesting another deposit.
  const totalDeposits = member.savings
    .filter((s) => s.type !== "WITHDRAWAL")
    .reduce((acc, s) => acc + Number(s.amount), 0)
  const totalWithdrawals = member.savings
    .filter((s) => s.type === "WITHDRAWAL")
    .reduce((acc, s) => acc + Number(s.amount), 0)
  const currentBalance = totalDeposits - totalWithdrawals

  return (
    <DepositRequestClient
      memberId={member.id}
      member={{
        memberNo: member.memberNo,
        fullName: member.fullName,
        currentBalance,
      }}
      collectionTypes={collectionTypes.map((c) => ({ id: c.id, name: c.name }))}
      bankAccounts={bankAccounts.map((b) => ({
        id: b.id,
        accountName: b.accountName,
        bankName: b.bankName,
        accountNumber: b.accountNumber,
        branch: b.branch,
        paymentMethod: b.paymentMethod,
        isDefault: b.isDefault,
      }))}
      missingGroups={missingGroups(defaultCoas)}
      recentRequests={recentRequests.map((r) => {
        const linked = r.transactions[0]
        // For DEPOSIT requests, the engine-side Transaction status is the
        // source of truth (it's where RETURNED / REJECTED / APPROVED live
        // after admin action). The MemberRequest.status mirrors it but lags
        // by one revalidation; show the txn status when available.
        const effectiveStatus = linked?.status ?? r.status
        return {
          id: r.id,
          amount: r.amount ? Number(r.amount) : null,
          method: r.method,
          notes: r.notes,
          status: effectiveStatus,
          // breakdown holds the collectionTypeId the member originally chose.
          collectionTypeId:
            ((r.breakdown as { collectionTypeId?: string } | null)?.collectionTypeId as
              | string
              | null) ?? null,
          referenceNo: r.referenceNo,
          transactionDate: r.transactionDate ? r.transactionDate.toISOString() : null,
          // Rejection reason lives on the Transaction for the DEPOSIT flow.
          rejectionReason: linked?.rejectionReason ?? r.rejectionReason ?? null,
          // Return reason is a Transaction-only field.
          returnReason: linked?.returnReason ?? null,
          voucherNo: linked?.voucherNo ?? null,
          reviewedBy: r.reviewedBy,
          reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
          attachments:
            (r.attachments as unknown as { type: string; name: string; url: string }[]) ?? [],
        }
      })}
    />
  )
}
