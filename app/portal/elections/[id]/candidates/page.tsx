/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getElection } from "@/app/actions/elections"
import { redirect } from "next/navigation"
import { ArrowLeft, User } from "lucide-react"
import prisma from "@/lib/prisma"

export const dynamic = "force-dynamic"

export default async function CandidateDirectoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const election = await getElection(id)
  if (!election) redirect("/portal/elections")

  // Show approved candidates only (spec §12).
  const positions = await prisma.electionPosition.findMany({
    where: { electionId: id, isActive: true },
    orderBy: { displayOrder: "asc" },
    include: {
      candidates: {
        where: { status: { in: ["APPROVED", "UNCONTESTED_ELECTED"] } },
        include: {
          member: { select: { id: true, fullName: true, memberNo: true, photoUrl: true, membershipDate: true } },
        },
      },
      nominations: {
        where: { status: "APPROVED" },
        select: { memberId: true, statement: true, manifesto: true, experience: true, photoUrl: true },
      },
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/portal/elections/${id}`} className="text-sm text-slate-500 hover:text-slate-700">← {election.name}</Link>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Candidate Directory</h1>
        <p className="text-sm text-slate-500">Approved candidates for each position.</p>
      </div>

      {positions.map((p) => {
        const nomByMember = new Map(p.nominations.map((n) => [n.memberId, n]))
        return (
          <div key={p.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{p.name}</h2>
              <Badge variant="outline">{p.seatCount} seat(s)</Badge>
            </div>
            {p.candidates.length === 0 ? (
              <p className="text-sm text-slate-500">No approved candidates for this position.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {p.candidates.map((c) => {
                  const nom = nomByMember.get(c.memberId)
                  return (
                    <div key={c.id} className="rounded-xl border border-slate-200 p-4 flex gap-4">
                      <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                        {c.member.photoUrl || nom?.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={(c.member.photoUrl || nom?.photoUrl) as string} alt={c.member.fullName} className="w-full h-full object-cover" />
                        ) : (
                          <User className="h-6 w-6 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900">{c.member.fullName}</p>
                        <p className="text-xs text-slate-500">Member No: {c.member.memberNo}</p>
                        <p className="text-xs text-slate-500">Member since: {new Date(c.member.membershipDate).toLocaleDateString()}</p>
                        {nom?.statement && (
                          <p className="text-sm text-slate-600 mt-2 line-clamp-3">{nom.statement}</p>
                        )}
                        {c.status === "UNCONTESTED_ELECTED" && (
                          <Badge className="mt-2 bg-purple-50 text-purple-700 border-purple-300">Uncontested — Elected</Badge>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
