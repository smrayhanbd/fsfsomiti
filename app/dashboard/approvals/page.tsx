import prisma from "@/lib/prisma"
import ApprovalsClient from "./ApprovalsClient"

export const dynamic = 'force-dynamic'

export default async function ApprovalsPage() {
  // Fetch the three approval-history groups in parallel.
  const [pendingMembers, approvedMembers, rejectedMembers] = await Promise.all([
    prisma.member.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
    // Recently approved — cap to 25 to keep the tab focused on "history".
    prisma.member.findMany({
      where: { status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: 25,
    }),
    prisma.member.findMany({
      where: { status: "REJECTED" },
      orderBy: { updatedAt: "desc" },
    }),
  ])

  const serialize = (m: typeof pendingMembers[number]) => ({
    id: m.id,
    fullName: m.fullName,
    memberNo: m.memberNo,
    phone: m.phone,
    email: m.email,
    remarks: m.remarks,
    createdAt: m.createdAt.toISOString(),
  })

  return (
    <ApprovalsClient
      pending={pendingMembers.map(serialize)}
      approved={approvedMembers.map(serialize)}
      rejected={rejectedMembers.map(serialize)}
    />
  )
}
