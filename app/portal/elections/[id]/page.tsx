/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getElection, getMemberVotingStatus } from "@/app/actions/elections"
import { redirect } from "next/navigation"
import { Vote, Users, Calendar, CheckCircle2, ArrowRight, FileText } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function MemberElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [election, status] = await Promise.all([
    getElection(id),
    getMemberVotingStatus(id),
  ])
  if (!election) redirect("/portal/elections")

  const isOpen = election.status === "VOTING_OPEN"
  const isPublished = ["RESULTS_PUBLISHED", "COMMITTEE_FORMED", "ARCHIVED"].includes(election.status)

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/elections" className="text-sm text-slate-500 hover:text-slate-700">← Elections</Link>
        <h1 className="text-2xl font-bold tracking-tight mt-1">{election.name}</h1>
        <p className="text-sm text-slate-500">{election.code}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Schedule" icon={Calendar}>
          <dl className="text-sm space-y-2">
            <Row label="Nomination" value={`${new Date(election.nominationStartAt).toLocaleString()} → ${new Date(election.nominationEndAt).toLocaleString()}`} />
            <Row label="Voting" value={`${new Date(election.votingStartAt).toLocaleString()} → ${new Date(election.votingEndAt).toLocaleString()}`} />
            <Row label="Term" value={`${new Date(election.termStartDate).toLocaleDateString()} → ${new Date(election.termEndDate).toLocaleDateString()}`} />
          </dl>
          {election.status === "NOMINATION_OPEN" && election.allowSelfNomination && (
            <Link href={`/portal/elections/${id}/nominate`}>
              <Button className="mt-3 w-full" variant="default">
                <FileText className="h-4 w-4 mr-2" /> Submit Nomination
              </Button>
            </Link>
          )}
        </Card>
        <Card title="Your Status" icon={Vote}>
          <dl className="text-sm space-y-2">
            <Row label="Eligible" value={status.eligible ? "Yes" : "No"} />
            <Row label="Voted" value={status.voted ? "Yes" : "No"} />
            <Row label="Voting Open" value={status.votingOpen ? "Yes" : "No"} />
            <Row label="Voting Closes" value={new Date(status.votingClosesAt).toLocaleString()} />
          </dl>
          {isOpen && status.eligible && !status.voted && (
            <Link href={`/portal/elections/${id}/vote`}>
              <Button className="mt-3 w-full"><Vote className="h-4 w-4 mr-2" /> Cast Your Vote</Button>
            </Link>
          )}
          {isOpen && status.voted && (
            <Link href={`/portal/elections/${id}/vote/success`}>
              <Button variant="outline" className="mt-3 w-full"><CheckCircle2 className="h-4 w-4 mr-2" /> View My Ballot</Button>
            </Link>
          )}
        </Card>
      </div>

      <Card title="Positions" icon={Users}>
        <ul className="text-sm divide-y divide-slate-100">
          {election.positions.map((p: any) => (
            <li key={p.id} className="py-2 flex justify-between">
              <span className="font-medium">{p.name}</span>
              <span className="text-slate-500">{p.seatCount} seat(s) · {p._count?.candidates || 0} candidate(s)</span>
            </li>
          ))}
        </ul>
        {election.status !== "DRAFT" && (
          <Link href={`/portal/elections/${id}/candidates`}>
            <Button variant="outline" size="sm" className="mt-3">View Candidates <ArrowRight className="h-3 w-3 ml-1" /></Button>
          </Link>
        )}
      </Card>

      {isPublished && (
        <Card title="Results" icon={CheckCircle2}>
          <p className="text-sm text-slate-500 mb-3">Results have been published.</p>
          <Link href={`/portal/elections/${id}/results`}>
            <Button>View Results <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </Link>
        </Card>
      )}

      {!election.secretBallot && (
        <p className="text-xs text-amber-600">⚠ This election uses non-confidential (relational) ballot storage.</p>
      )}
    </div>
  )
}

function Card({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" /> {title}
      </h3>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-900">{value}</dd>
    </div>
  )
}
