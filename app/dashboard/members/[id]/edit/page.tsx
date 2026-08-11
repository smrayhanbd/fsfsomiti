import prisma from "@/lib/prisma"
import { notFound } from "next/navigation"
import MemberForm from "@/components/member/MemberForm"

export const dynamic = 'force-dynamic'

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
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
