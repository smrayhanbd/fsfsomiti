import prisma from "@/lib/prisma"
import VoucherEntryForm from "./VoucherEntryForm"
import { voucherPrefix } from "@/lib/accounting"

export const dynamic = "force-dynamic"

export default async function VoucherEntryPage() {
  // Only accounts that may receive postings are selectable.
  const accounts = await prisma.account.findMany({
    where: {
      status: "ACTIVE",
      allowPosting: true,
    },
    orderBy: [{ accountType: "asc" }, { accountCode: "asc" }],
    select: {
      id: true,
      accountCode: true,
      accountName: true,
      accountType: true,
      currentBalance: true,
    },
  })

  const members = await prisma.member.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, fullName: true, memberNo: true },
    orderBy: { fullName: "asc" },
  })

  // Hint the user about the next voucher number per type. The actual number is
  // generated server-side at submit time to stay race-safe.
  const nextVoucherHints = {
    JOURNAL: `${voucherPrefix("JOURNAL")}-????`,
    RECEIPT: `${voucherPrefix("RECEIPT")}-????`,
    PAYMENT: `${voucherPrefix("PAYMENT")}-????`,
    CONTRA: `${voucherPrefix("CONTRA")}-????`,
  }

  const serializedAccounts = JSON.parse(JSON.stringify(accounts))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Voucher Entry
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Record double-entry journal, receipt, payment and contra vouchers.
        </p>
      </div>
      <VoucherEntryForm
        accounts={serializedAccounts}
        members={JSON.parse(JSON.stringify(members))}
        nextVoucherHints={nextVoucherHints}
      />
    </div>
  )
}
