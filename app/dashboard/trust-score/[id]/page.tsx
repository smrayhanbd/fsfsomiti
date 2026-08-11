import prisma from "@/lib/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getKpiConfig, getScoreView } from "@/lib/trustScore"
import ScoreDashboard from "@/components/trust-score/ScoreDashboard"
import ReactivateButton from "./ReactivateButton"

export const dynamic = "force-dynamic"

export default async function TrustScoreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const member = await prisma.member.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      memberNo: true,
      photoUrl: true,
      status: true,
      trustScore: true,
    },
  })
  if (!member) notFound()

  const view = await getScoreView(id)
  if (!view) notFound()

  // Merge display fields the engine context doesn't carry.
  view.member.fullName = member.fullName
  view.member.memberNo = member.memberNo
  view.member.photoUrl = member.photoUrl

  const config = await getKpiConfig()
  const isSuspended = member.status === "SUSPENDED"
  const canReactivate = isSuspended && member.trustScore >= config.reactivationThreshold

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-white dark:bg-slate-950 border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="flex items-center justify-between">
          <Link href="/dashboard/trust-score">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Leaderboard
            </Button>
          </Link>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-900 dark:text-white">{member.fullName}</p>
            <p className="text-xs font-mono text-slate-400">{member.memberNo}</p>
          </div>
        </div>
      </div>

      <ScoreDashboard
        view={view}
        reactivationSlot={
          isSuspended ? (
            <ReactivateButton
              memberId={member.id}
              canReactivate={canReactivate}
              reason={
                canReactivate
                  ? undefined
                  : `Score ${member.trustScore} is below the reactivation threshold (${config.reactivationThreshold}).`
              }
            />
          ) : undefined
        }
      />
    </div>
  )
}
