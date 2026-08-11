import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { plain } from "@/lib/serialize"
import DepositClient from "./DepositClient"

export const dynamic = "force-dynamic"

/**
 * Member Portal → Deposit Request (server data layer).
 *
 * Members who have deposited money to the somiti's bank/MFS account submit a
 * request here with the deposit slip / transaction screenshot as proof. Admins
 * review and approve/reject on the Transaction Approvals page.
 */
export default async function PortalDepositPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") {
    redirect("/")
  }

  const memberId = session.user.id

  const [member, depositRequests, org, bankAccounts] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        fullName: true,
        memberNo: true,
        savings: { select: { type: true, amount: true } },
      },
    }),
    prisma.memberRequest.findMany({
      where: { memberId, type: "DEPOSIT" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        amount: true,
        method: true,
        notes: true,
        // The slipUrl / transactionRef columns were dropped by migration
        // 20260811000002_drop_dead_columns. The deposit slip URL now lives in
        // the JSONB `attachments` array (e.g. [{ type, name, url }]) and the
        // member-entered transaction id lives in `referenceNo`.
        attachments: true,
        referenceNo: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.organization.findUnique({
      where: { id: "singleton" },
      select: {
        name: true,
        addressLine: true,
        phone: true,
        email: true,
      },
    }),
    prisma.bankAccount.findMany({
      where: { isActive: true },
      orderBy: { isDefault: "desc" },
    }),
  ])

  if (!member) redirect("/portal")

  // Compute current balance
  const totalDeposit = member.savings
    .filter((s) => !["WITHDRAWAL", "FINE", "PENALTY", "LOAN_PAYMENT"].includes(s.type))
    .reduce((acc, s) => acc + Number(s.amount), 0)
  const totalWithdrawal = member.savings
    .filter((s) => s.type === "WITHDRAWAL")
    .reduce((acc, s) => acc + Number(s.amount), 0)
  const currentBalance = totalDeposit - totalWithdrawal

  // Prisma types `attachments` as `Prisma.JsonValue` (a wide union including
  // null/scalars/objects/arrays). At runtime it's always the JSONB array
  // `[{ type, name, url }]` written by `submitDepositRequest` (default `[]`),
  // so we cast here at the server→client boundary before `plain()` walks it.
  // `plain()` preserves the casted shape (no Decimals/Dates/BigInts inside).
  const typedDepositRequests = depositRequests.map((r) => ({
    ...r,
    attachments: (r.attachments ?? []) as unknown as {
      type: string
      name: string
      url: string
    }[],
  }))

  return (
    <DepositClient
      memberId={member.id}
      memberName={member.fullName}
      memberNo={member.memberNo}
      currentBalance={currentBalance}
      requests={plain(typedDepositRequests)}
      org={org ? plain(org) : null}
      bankAccounts={plain(bankAccounts)}
    />
  )
}
