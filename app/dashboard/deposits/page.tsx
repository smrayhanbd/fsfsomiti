import prisma from "@/lib/prisma"
import Link from "next/link"
import WithdrawalClient from "./WithdrawalClient"

export const dynamic = 'force-dynamic'

export default async function WithdrawalEntryPage() {
  // 1. Fetch Active Members with calculated balances
  const dbMembers = await prisma.member.findMany({
    where: { status: "ACTIVE" },
    include: { savings: true }
  })

  const members = dbMembers.map(m => {
    const totalDeposit = m.savings.filter(s => s.type !== "WITHDRAWAL").reduce((acc, s) => acc + Number(s.amount), 0)
    const totalWithdrawal = m.savings.filter(s => s.type === "WITHDRAWAL").reduce((acc, s) => acc + Number(s.amount), 0)
    return {
      id: m.id,
      fullName: m.fullName,
      memberNo: m.memberNo,
      phone: m.phone,
      totalDeposit,
      totalWithdrawal
    }
  })

  // 2. Fetch Recent Withdrawals (Global History)
  const dbHistory = await prisma.savings.findMany({
    where: { type: "WITHDRAWAL" },
    orderBy: { date: "desc" },
    take: 10
  })

  const history = dbHistory.map(h => ({
    id: h.id,
    receiptNo: h.receiptNo,
    amount: Number(h.amount),
    date: h.date.toISOString(),
    method: h.method
  }))

  return (
    <div className="space-y-6">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-800/50">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div>
            <div className="flex items-center text-xs text-gray-500 mb-1">
              <Link href="/dashboard" className="hover:text-indigo-600">Dashboard</Link>
              <span className="mx-1">/</span>
              <span className="text-gray-900 dark:text-white">Withdrawal Entry</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Withdrawal Entry</h1>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs text-slate-400 uppercase font-bold">Business Date</p>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      <WithdrawalClient members={members} history={history} />
    </div>
  )
}