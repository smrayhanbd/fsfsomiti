// Member-facing Trust Score dashboard (FRS §11).
//
// Read-only self-service view of the member's own score, KPI breakdown, badges,
// suggestions, and history. Reuses the same ScoreDashboard component as the
// admin detail page so both stay consistent. No reactivation slot here —
// members cannot self-reactivate (FRS §9.2).

import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getScoreView } from "@/lib/trustScore"
import ScoreDashboard from "@/components/trust-score/ScoreDashboard"

export const dynamic = "force-dynamic"

export default async function MyTrustScorePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") redirect("/")
  const memberId = session.user.id

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, fullName: true, memberNo: true, photoUrl: true },
  })
  if (!member) redirect("/")

  const view = await getScoreView(memberId)
  if (!view) redirect("/")

  // Merge display fields the engine context doesn't carry.
  view.member.fullName = member.fullName
  view.member.memberNo = member.memberNo
  view.member.photoUrl = member.photoUrl

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          My Trust Score
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          Your Trust Score reflects your savings discipline, loan repayment, meeting attendance, fines, and referrals. It updates automatically with your activity.
        </p>
      </div>

      <ScoreDashboard view={view} />
    </div>
  )
}
