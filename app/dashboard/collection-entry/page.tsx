import prisma from "@/lib/prisma"
import Link from "next/link"
import CollectionForm from "./CollectionForm"

export const dynamic = 'force-dynamic'

export default async function CollectionEntryPage() {
  // 1. Fetch Active Members with their savings to calculate real balances
  const dbMembers = await prisma.member.findMany({
    where: { status: "ACTIVE" },
    include: { savings: true },
  })

  const members = dbMembers.map(m => {
    const totalDeposit = m.savings.filter(s => s.type !== "WITHDRAWAL").reduce((acc, s) => acc + Number(s.amount), 0)
    const totalWithdrawal = m.savings.filter(s => s.type === "WITHDRAWAL").reduce((acc, s) => acc + Number(s.amount), 0)
    return {
      id: m.id,
      fullName: m.fullName,
      memberNo: m.memberNo,
      phone: m.phone,
      currentBalance: totalDeposit - totalWithdrawal,
    }
  })

  // 2. Fetch Today's Overview Stats
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date()
  endOfDay.setHours(23, 59, 59, 999)

  const todaysSavings = await prisma.savings.findMany({
    where: { 
      date: { gte: startOfDay, lte: endOfDay },
      type: { not: "WITHDRAWAL" } 
    },
  })

  const todaysCollection = todaysSavings.reduce((acc, s) => acc + Number(s.amount), 0)
  const cashBalance = todaysSavings.filter(s => s.method === "CASH").reduce((acc, s) => acc + Number(s.amount), 0)
  const todaysTransactions = todaysSavings.length

  // 3. Define the overview object
  const overview = {
    todaysCollection,
    cashBalance,
    todaysTransactions,
  }

  return (
    <div className="space-y-6">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-800/50">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div>
            <div className="flex items-center text-xs text-gray-500 mb-1">
              <Link href="/dashboard" className="hover:text-indigo-600">Dashboard</Link>
              <span className="mx-1">/</span>
              <span className="text-gray-900 dark:text-white">Collection Entry</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Collection Entry</h1>
          </div>
        </div>
      </div>

      <CollectionForm members={members} overview={overview} />
    </div>
  )
}