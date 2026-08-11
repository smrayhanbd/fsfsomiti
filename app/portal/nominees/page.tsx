import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { plain } from "@/lib/serialize"
import NomineesClient from "./NomineesClient"

export const dynamic = "force-dynamic"

/**
 * Member Portal → Nominees (server data layer).
 *
 * Lets the member view, add, edit, and reorder their nominees — the people
 * entitled to their accumulated savings / share in the event of death. The
 * member can manage nominees self-service here; every change creates an
 * admin notification so the office can verify the new nominee's ID.
 *
 * All Prisma data is serialized through `plain()` before being handed to the
 * client component (so Decimal / Date objects never cross the
 * Server→Client boundary).
 */
export default async function PortalNomineesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") {
    redirect("/")
  }

  const memberId = session.user.id

  const [member, nominees] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        memberNo: true,
        fullName: true,
        status: true,
        kycVerified: true,
      },
    }),
    prisma.memberNominee.findMany({
      where: { memberId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        relation: true,
        phone: true,
        email: true,
        dateOfBirth: true,
        nidNumber: true,
        idType: true,
        sharePercentage: true,
        photoUrl: true,
        signatureUrl: true,
        idDocumentUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ])

  if (!member) redirect("/portal")

  // Total share — must be 100% (or 0 if no nominees yet). We display this so
  // the member notices if they've under-allocated.
  const totalShare = nominees.reduce(
    (acc, n) => acc + Number(n.sharePercentage),
    0
  )

  return (
    <NomineesClient
      member={plain(member)}
      nominees={plain(nominees)}
      totalShare={totalShare}
    />
  )
}
