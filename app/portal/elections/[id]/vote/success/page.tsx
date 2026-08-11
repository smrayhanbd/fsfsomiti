/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, ShieldCheck, ArrowRight } from "lucide-react"
import { getMemberVotingStatus } from "@/app/actions/elections"
import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function VoteSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ref?: string }>
}) {
  const { id } = await params
  const { ref } = await searchParams
  const status = await getMemberVotingStatus(id)

  if (!status.voted) {
    redirect(`/portal/elections/${id}`)
  }

  // Fetch the ballot reference if not provided in the query string.
  let ballotReference = ref
  if (!ballotReference) {
    const ballot = await prisma.electionBallot.findFirst({
      where: { electionId: id },
      orderBy: { castAt: "desc" },
      select: { ballotReference: true },
    })
    ballotReference = ballot?.ballotReference
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-4">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Vote Recorded</h1>
        <p className="text-sm text-slate-500 mt-1">Your ballot has been successfully submitted.</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Ballot Reference</p>
            <p className="font-mono text-lg font-bold text-slate-900">{ballotReference || "—"}</p>
            <p className="text-xs text-slate-500 mt-1">
              Save this reference. It does NOT reveal your selections — it only lets you verify your ballot was recorded.
            </p>
          </div>
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Submitted At</p>
            <p className="text-sm">{status.votedAt ? new Date(status.votedAt).toLocaleString() : "—"}</p>
          </div>
          <div className="border-t border-slate-100 pt-3 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600">
              Your selections are encrypted (AES-256-GCM) and stored separately from your identity.
              No administrator can link your ballot to your choices through the application.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Link href={`/portal/elections/${id}`} className="flex-1">
          <Button variant="outline" className="w-full">Back to Election</Button>
        </Link>
        {ballotReference && (
          <a href={`/api/member/elections/${id}/ballot/${ballotReference}/verify`} target="_blank" rel="noreferrer" className="flex-1">
            <Button className="w-full">Verify Ballot <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </a>
        )}
      </div>
    </div>
  )
}
