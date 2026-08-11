import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import prisma from "@/lib/prisma"
import { getOrganization } from "@/lib/organization"
import PortalShell from "@/components/PortalShell"
import { getMemberNotifications, getMemberPendingRequestCount, getTransparencySettings } from "@/app/actions/portal"

export const dynamic = "force-dynamic"

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  // Gate: only authenticated members may see the portal.
  if (!session?.user || session.user.role !== "MEMBER") {
    redirect("/")
  }

  const memberId = session.user.id

  // Fetch the member + pending request count + org + computed notifications in parallel.
  const [member, pendingRequests, notifications, org, transparency] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      select: { fullName: true, memberNo: true, photoUrl: true },
    }),
    getMemberPendingRequestCount(memberId).catch(() => 0),
    getMemberNotifications(memberId).catch(() => []),
    getOrganization(),
    getTransparencySettings(),
  ])

  if (!member) {
    redirect("/")
  }

  return (
    <PortalShell
      memberId={memberId}
      memberName={member.fullName}
      memberNo={member.memberNo}
      photoUrl={member.photoUrl}
      notifications={notifications}
      pendingRequests={pendingRequests}
      org={org}
      transparency={transparency}
    >
      {children}
    </PortalShell>
  )
}
