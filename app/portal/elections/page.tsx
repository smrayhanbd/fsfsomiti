/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getMemberElections } from "@/app/actions/elections"
import { Vote, ArrowRight, CheckCircle2 } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function MemberElectionsPage() {
  const elections = (await getMemberElections()) as any[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Vote className="h-6 w-6 text-indigo-600" /> Elections
        </h1>
        <p className="text-sm text-slate-500 mt-1">View active and past elections you are eligible for.</p>
      </div>

      {elections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <Vote className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No elections available for you right now.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {elections.map((e) => {
            const voted = e.participation?.[0]?.voted
            const isOpen = e.status === "VOTING_OPEN"
            const nominationsOpen = e.status === "NOMINATION_OPEN"
            const isPublished = ["RESULTS_PUBLISHED", "COMMITTEE_FORMED", "ARCHIVED"].includes(e.status)
            const hasNominated = (e.nominations?.length || 0) > 0
            return (
              <div key={e.id} className="rounded-xl border border-slate-200 p-5 flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-slate-900">{e.name}</h3>
                  <p className="text-sm text-slate-500">
                    Term: {new Date(e.termStartDate).toLocaleDateString()} → {new Date(e.termEndDate).toLocaleDateString()}
                  </p>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <Badge variant="outline">{e.status.replace(/_/g, " ")}</Badge>
                    {voted && (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-300">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> You voted
                      </Badge>
                    )}
                    {nominationsOpen && !hasNominated && (
                      <Badge className="bg-blue-600 text-white">Nominations open — action needed</Badge>
                    )}
                    {nominationsOpen && hasNominated && (
                      <Badge className="bg-blue-50 text-blue-700 border-blue-300">You nominated</Badge>
                    )}
                    {isOpen && !voted && (
                      <Badge className="bg-emerald-600 text-white">Voting open — action needed</Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link href={`/portal/elections/${e.id}`}>
                    <Button variant="outline" size="sm">View <ArrowRight className="h-3 w-3 ml-1" /></Button>
                  </Link>
                  {nominationsOpen && (
                    <Link href={`/portal/elections/${e.id}/nominate`}>
                      <Button size="sm" variant={hasNominated ? "outline" : "default"}>
                        {hasNominated ? "My Nominations" : "Nominate"}
                      </Button>
                    </Link>
                  )}
                  {isOpen && !voted && (
                    <Link href={`/portal/elections/${e.id}/vote`}>
                      <Button size="sm">Vote Now</Button>
                    </Link>
                  )}
                  {isOpen && voted && (
                    <Link href={`/portal/elections/${e.id}/vote/success`}>
                      <Button variant="outline" size="sm">My Ballot</Button>
                    </Link>
                  )}
                  {isPublished && (
                    <Link href={`/portal/elections/${e.id}/results`}>
                      <Button variant="outline" size="sm">Results</Button>
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
