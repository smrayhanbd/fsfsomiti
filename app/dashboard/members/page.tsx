import { calculateDues } from "@/lib/dueCalculator"
import prisma from "@/lib/prisma"
import MemberListClient from "./MemberListClient"

export const dynamic = 'force-dynamic'

export default async function MembersPage() {
  // Fetch real members with related data for the list + quick-view drawer
  const dbMembers = await prisma.member.findMany({
    include: {
      savings: true,
      nominees: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const feeSetups = await prisma.feeSetup.findMany()

  const members = dbMembers.map(m => {
    const dues = calculateDues(m.id, m.membershipDate || m.createdAt, feeSetups, m.savings)

    return {
      id: m.id,
      fullName: m.fullName,
      memberNo: m.memberNo,
      phone: m.phone,
      email: m.email,
      gender: m.gender || "OTHER",
      status: m.status as "ACTIVE" | "PENDING" | "SUSPENDED" | "INACTIVE" | "REJECTED",
      nidNumber: m.nidNumber,
      kycVerified: m.kycVerified || false,
      photoUrl: m.photoUrl,
      profession: m.profession,
      nomineesCount: m.nominees.length,
      savings: m.savings.map((s) => ({ amount: Number(s.amount) })),
      createdAt: m.createdAt.toISOString(),
      membershipDate: (m.membershipDate || m.createdAt).toISOString(),
      dueBalance: dues.totalDue,
      lateFines: dues.totalFines,
    }
  })

  return <MemberListClient members={members} />
}
