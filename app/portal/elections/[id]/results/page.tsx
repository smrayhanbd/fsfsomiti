/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getElectionResults } from "@/app/actions/elections"
import { redirect } from "next/navigation"
import { ArrowLeft, ShieldCheck } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let data: any
  try {
    data = await getElectionResults(id)
  } catch {
    redirect("/portal/elections")
  }

  if (!data.published) {
    return (
      <div className="max-w-2xl space-y-4">
        <Link href={`/portal/elections/${id}`} className="text-sm text-slate-500 hover:text-slate-700">← Back</Link>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-slate-500">Results have not been published yet.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href={`/portal/elections/${id}`} className="text-sm text-slate-500 hover:text-slate-700">← {data.election.name}</Link>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Election Results</h1>
        <p className="text-sm text-slate-500">Term: {new Date(data.election.termStartDate).toLocaleDateString()} → {new Date(data.election.termEndDate).toLocaleDateString()}</p>
      </div>

      <Card>
        <CardContent className="pt-6 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>
            <p className="text-sm font-medium">Result Verification Hash</p>
            <p className="text-xs font-mono break-all text-slate-600 mt-1">{data.election.resultHash}</p>
            <p className="text-xs text-slate-500 mt-1">
              This SHA-256 hash proves the published result corresponds to the counted ballots. A recount produces the same hash (determinism check, spec §73).
            </p>
          </div>
        </CardContent>
      </Card>

      {data.positions.map((p: any) => (
        <Card key={p.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{p.name}</span>
              <Badge variant="outline">{p.seatCount} seat(s)</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!p.resultsPublished ? (
              <p className="text-sm text-amber-600">Results pending for this position (tie resolution in progress).</p>
            ) : p.results.length === 0 ? (
              <p className="text-sm text-slate-500">No results recorded.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-100">
                    <th className="text-left py-2 font-medium">Rank</th>
                    <th className="text-left py-2 font-medium">Candidate</th>
                    <th className="text-right py-2 font-medium">Votes</th>
                    <th className="text-right py-2 font-medium">%</th>
                    <th className="text-center py-2 font-medium">Elected</th>
                  </tr>
                </thead>
                <tbody>
                  {p.results.map((r: any) => (
                    <tr key={r.id} className="border-b border-slate-50">
                      <td className="py-2">{r.rank}</td>
                      <td className="py-2 font-medium">{r.label}</td>
                      <td className="py-2 text-right tabular-nums">{r.voteCount}</td>
                      <td className="py-2 text-right tabular-nums">{Number(r.votePercentage).toFixed(1)}%</td>
                      <td className="py-2 text-center">{r.elected ? "✓" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
