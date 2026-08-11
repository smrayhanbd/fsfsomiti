import prisma from "@/lib/prisma"
import { calculateDues } from "@/lib/dueCalculator"
import PageHeader from "@/components/somiti/PageHeader"
import DueListClient from "./DueListClient"

export const dynamic = 'force-dynamic'

export default async function DueListPage() {
  // 1. Fetch all active members and fee setups
  const dbMembers = await prisma.member.findMany({
    where: { status: "ACTIVE" },
    include: { savings: true },
    orderBy: { firstName: "asc" },
  })

  const feeSetups = await prisma.feeSetup.findMany()

  // 2. Calculate dues for each member and filter out those with 0 due
  const dueMembers = dbMembers.map(m => {
    const dues = calculateDues(m.id, m.membershipDate || m.createdAt, feeSetups, m.savings)
    
    return {
      id: m.id,
      fullName: m.fullName,
      memberNo: m.memberNo,
      phone: m.phone,
      email: m.email,
      totalExpected: dues.totalExpected,
      totalFines: dues.totalFines,
      totalPaid: dues.totalPaid,
      totalDue: dues.totalDue,
    }
  }).filter(m => m.totalDue > 0) // Only keep members who actually owe money

  return (
    <div className="space-y-8">
      <PageHeader
        title="Due List & Reminders"
        subtitle="Automatically calculated based on historical charge setups and late fines."
      />
      <DueListClient members={dueMembers} />
    </div>
  )
}