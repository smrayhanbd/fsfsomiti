import prisma from "@/lib/prisma"
import { notFound } from "next/navigation"
import MemberForm from "@/components/member/MemberForm"
import LinkedTasksPanel from "@/components/tasks/LinkedTasksPanel"
import { listTasks } from "@/app/actions/tasks"

export const dynamic = 'force-dynamic'

export default async function ReviewApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const member = await prisma.member.findUnique({
    where: { id },
    include: { addresses: true, nominees: true, documents: true }
  })

  if (!member) {
    notFound()
  }

  const serializedMember = JSON.parse(JSON.stringify(member))

  // Tasks linked to this member (onboarding follow-ups, etc.).
  const linkedTasks = await listTasks({ relatedMemberId: id, limit: 10 })

  return (
    <div className="space-y-4">
      <MemberForm mode="review" member={serializedMember} />
      <LinkedTasksPanel
        tasks={linkedTasks}
        createHref={`/dashboard/tasks/new?link=relatedMemberId&id=${member.id}&label=${encodeURIComponent(member.fullName)}`}
        title={`Tasks for ${member.fullName}`}
      />
    </div>
  )
}
