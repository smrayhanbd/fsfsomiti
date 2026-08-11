import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import ApprovalsClient, { type ProfileApprovalItem } from "./ApprovalsClient"

export const dynamic = "force-dynamic"

export default async function ProfileApprovalsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")

  const requests = await prisma.profileUpdateRequest.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      member: {
        select: { id: true, memberNo: true, fullName: true, phone: true, email: true, photoUrl: true },
      },
    },
  })

  const items: ProfileApprovalItem[] = requests.map((r) => ({
    id: r.id,
    payload: (r.payload ?? {}) as Record<string, string>,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    member: {
      id: r.member.id,
      memberNo: r.member.memberNo,
      fullName: r.member.fullName,
      phone: r.member.phone,
      email: r.member.email,
      photoUrl: r.member.photoUrl,
    },
  }))

  return <ApprovalsClient items={items} />
}
