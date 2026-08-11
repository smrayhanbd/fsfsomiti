import prisma from "@/lib/prisma"
import VouchersTable from "./VouchersTable"

export const dynamic = "force-dynamic"

export default async function VouchersPage() {
  const entries = await prisma.journalEntry.findMany({
    include: {
      lines: {
        include: {
          account: {
            select: { accountCode: true, accountName: true },
          },
        },
        orderBy: { debit: "desc" },
      },
      member: {
        select: { fullName: true, memberNo: true },
      },
    },
    orderBy: { entryDate: "desc" },
    take: 200,
  })

  const serialized = JSON.parse(JSON.stringify(entries))

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Vouchers
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Review, post, and audit journal entries.
          </p>
        </div>
      </div>
      <VouchersTable entries={serialized} />
    </div>
  )
}
