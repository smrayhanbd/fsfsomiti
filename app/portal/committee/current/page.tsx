/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getCurrentCommittee } from "@/app/actions/elections"
import { Landmark, User } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function CurrentCommitteePage() {
  const committee = (await getCurrentCommittee()) as any

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Landmark className="h-6 w-6 text-indigo-600" /> Executive Committee
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {committee
            ? `Term: ${new Date(committee.termStartDate).toLocaleDateString()} → ${new Date(committee.termEndDate).toLocaleDateString()}`
            : "No active committee."}
        </p>
      </div>

      {!committee ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-slate-500">There is no active executive committee at this time.</p>
            <Link href="/portal/committees" className="mt-2 inline-block">
              <Button variant="outline" size="sm">View Past Committees</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {committee.members.map((m: any) => (
            <Card key={m.id}>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                  {m.member.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.member.photoUrl} alt={m.member.fullName} className="w-full h-full object-cover" />
                  ) : (
                    <User className="h-6 w-6 text-slate-400" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">{m.member.fullName}</p>
                  <p className="text-sm text-slate-500">{m.positionName}</p>
                  <p className="text-xs text-slate-400">Member No: {m.member.memberNo}</p>
                  {m.electionMethod && (
                    <Badge variant="outline" className="mt-1 text-xs">{m.electionMethod}</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
