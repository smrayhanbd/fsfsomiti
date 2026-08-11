import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { plain } from "@/lib/serialize"
import { getScoreView, type ScoreView } from "@/lib/trustScore"
import ProfileClient from "./ProfileClient"

export const dynamic = "force-dynamic"

/**
 * Member Portal → My Profile (server data layer).
 *
 * All Prisma data is serialized through `plain()` before being handed to the
 * client component, so Decimal / Date objects never cross the Server→Client
 * boundary (they would otherwise throw "Only plain objects can be passed…").
 */
export default async function PortalProfilePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") {
    redirect("/")
  }

  const memberId = session.user.id

  const [member, pendingProfileRequests, scoreView, recentSavings] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      include: { addresses: true, nominees: true, documents: true },
    }),
    prisma.profileUpdateRequest.findMany({
      where: { memberId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { id: true, payload: true, createdAt: true },
      take: 5,
    }),
    getScoreView(memberId).catch(() => null),
    prisma.savings.findMany({
      where: { memberId },
      orderBy: { date: "desc" },
      take: 8,
      select: { id: true, type: true, amount: true, date: true, receiptNo: true },
    }),
  ])

  if (!member) redirect("/portal")

  // Pending photo-update request (badges the avatar).
  const pendingPhoto = pendingProfileRequests.find((r) => {
    const p = r.payload as Record<string, unknown> | null
    return p && typeof p === "object" && "photoUrl" in p
  })

  // Profile completion — weighted across the key identity/financial fields.
  const completion = computeCompletion(member)

  return (
    <ProfileClient
      member={plain(member)}
      scoreView={scoreView}
      recentSavings={plain(recentSavings)}
      pendingPhoto={!!pendingPhoto}
      completion={completion}
    />
  )
}

/**
 * Weighted profile completion score (0–100).
 * Counts the fields a reviewer most cares about for KYC / payout readiness.
 */
function computeCompletion(m: {
  fullName: string
  phone: string
  email: string | null
  photoUrl: string | null
  dateOfBirth: Date | null
  gender: unknown
  profession: string | null
  fatherName: string | null
  motherName: string | null
  nidNumber: string | null
  accountName: string | null
  accountNumber: string | null
  bankName: string | null
  addresses: unknown[]
  nominees: unknown[]
}) {
  // Each entry is [value, weight]; weights sum to 100.
  const checks: Array<[unknown, number]> = [
    [m.fullName, 8],
    [m.phone, 8],
    [m.email, 6],
    [m.photoUrl, 8],
    [m.dateOfBirth, 6],
    [m.gender, 4],
    [m.profession, 4],
    [m.fatherName, 4],
    [m.motherName, 4],
    [m.nidNumber, 12],
    [m.accountName, 9],
    [m.accountNumber, 9],
    [m.bankName, 9],
    [m.addresses.length > 0, 5],
    [m.nominees.length > 0, 4],
  ]
  return checks.reduce((acc, [val, w]) => acc + (filled(val) ? w : 0), 0)
}

function filled(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === "boolean") return v
  if (typeof v === "string") return v.trim().length > 0
  return true
}

export type { ScoreView }
