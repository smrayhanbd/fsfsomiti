import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import ReceiptLookupClient from "./ReceiptLookupClient"

export const dynamic = "force-dynamic"

/**
 * Money Receipts index — a lookup that resolves a voucher number to its
 * printable receipt. Revives the previously-deleted placeholder route so the
 * sidebar "Reports → Money Receipts" link works.
 *
 * Lists the most recent APPROVED deposits & withdrawals as quick links, and
 * lets the admin type/paste a voucher number to jump straight to the receipt.
 */
export default async function MoneyReceiptsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")

  const recent = await prisma.transaction.findMany({
    where: {
      status: "APPROVED",
      transactionType: { in: ["DEPOSIT", "WITHDRAWAL"] },
    },
    select: {
      id: true,
      voucherNo: true,
      transactionType: true,
      amount: true,
      transactionDate: true,
      member: { select: { memberNo: true, fullName: true } },
    },
    orderBy: { transactionDate: "desc" },
    take: 20,
  })

  return (
    <ReceiptLookupClient
      recent={recent.map((t) => ({
        id: t.id,
        voucherNo: t.voucherNo,
        transactionType: t.transactionType as "DEPOSIT" | "WITHDRAWAL",
        amount: Number(t.amount),
        transactionDate: t.transactionDate.toISOString(),
        member: t.member
          ? { memberNo: t.member.memberNo, fullName: t.member.fullName }
          : null,
      }))}
    />
  )
}
