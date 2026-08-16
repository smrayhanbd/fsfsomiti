import prisma from "@/lib/prisma"
import { notFound } from "next/navigation"
import MemberForm from "@/components/member/MemberForm"
import { guardDashboardPage } from "@/lib/page-guard"

export const dynamic = 'force-dynamic'

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("Member Management", "Member Panel")


  const { id } = await params

  const member = await prisma.member.findUnique({
    where: { id },
    include: {
      addresses: true,
      nominees: true,
      documents: true,
      referredBy: { select: { memberNo: true } },
    }
  })

  if (!member) {
    notFound()
  }

  // Serialize dates to strings for the client component state. Expose the
  // referrer's memberNo as `referredByMemberNo` for the form field.
  const serializedMember = {
    ...JSON.parse(JSON.stringify(member)),
    referredByMemberNo: member.referredBy?.memberNo ?? "",
  }

  return <MemberForm mode="edit" member={serializedMember} />
}
