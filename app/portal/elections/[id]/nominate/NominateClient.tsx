/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { ArrowLeft, Send, CheckCircle2, AlertTriangle, FileText } from "lucide-react"
import { submitNomination, withdrawNomination } from "@/app/actions/elections"
import { toast } from "sonner"

interface Ctx {
  election: {
    id: string
    name: string
    code: string
    status: string
    nominationStartAt: string
    nominationEndAt: string
    allowSelfNomination: boolean
    maxPositionsPerCandidate: number
  }
  positions: Array<{ id: string; name: string; code: string; seatCount: number; description?: string | null }>
  myNominations: Array<{ id: string; positionId: string; status: string; submittedAt: string | null }>
  eligible: boolean
  ineligibleReason: string | null
  memberId: string
}

const STATUS_TONES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SUBMITTED: "bg-blue-50 text-blue-700",
  UNDER_REVIEW: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
  WITHDRAWN: "bg-slate-100 text-slate-500",
  DISQUALIFIED: "bg-red-100 text-red-800",
}

export default function NominateClient({ ctx }: { ctx: Ctx }) {
  const router = useRouter()
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [declaration, setDeclaration] = useState(false)

  // Positions the member has ALREADY nominated for (active statuses only).
  const nominatedPositionIds = new Set(ctx.myNominations.map((n) => n.positionId))
  const activeNominationCount = ctx.myNominations.length
  const remainingSlots = Math.max(0, ctx.election.maxPositionsPerCandidate - activeNominationCount)

  // Filter out positions the member already nominated for.
  const availablePositions = ctx.positions.filter((p) => !nominatedPositionIds.has(p.id))

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedPositionId) {
      toast.error("Please select a position to contest.")
      return
    }
    if (!declaration) {
      toast.error("You must confirm the declaration.")
      return
    }
    setSubmitting(true)
    const formData = new FormData(e.currentTarget)
    formData.set("electionId", ctx.election.id)
    formData.set("positionId", selectedPositionId)
    formData.set("declaration", "true")
    const result = await submitNomination(formData)
    setSubmitting(false)
    if (result.ok) {
      toast.success("Nomination submitted. The election admin will review it.")
      router.push(`/portal/elections/${ctx.election.id}`)
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function handleWithdraw(nominationId: string) {
    if (!confirm("Withdraw this nomination? This cannot be undone.")) return
    const r = await withdrawNomination(ctx.election.id, nominationId)
    if (r.ok) {
      toast.success("Nomination withdrawn.")
      router.refresh()
    } else {
      toast.error(r.error)
    }
  }

  // ── Eligibility gate ──
  if (!ctx.eligible) {
    return (
      <div className="max-w-2xl space-y-4">
        <Link href={`/portal/elections/${ctx.election.id}`} className="text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4 inline mr-1" /> Back to election
        </Link>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-900">You are not eligible to contest this election.</p>
                <p className="text-sm text-slate-600 mt-1">
                  {ctx.ineligibleReason || "Please contact the election administrator if you believe this is an error."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Cross-position limit reached ──
  if (remainingSlots === 0) {
    return (
      <div className="max-w-2xl space-y-4">
        <Link href={`/portal/elections/${ctx.election.id}`} className="text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4 inline mr-1" /> Back to election
        </Link>
        <Card>
          <CardContent className="pt-6">
            <p className="text-slate-700">
              You have reached the maximum of {ctx.election.maxPositionsPerCandidate} nomination(s) for this election.
              Withdraw an existing nomination to contest a different position.
            </p>
          </CardContent>
        </Card>
        <MyNominationsList nominations={ctx.myNominations} positions={ctx.positions} onWithdraw={handleWithdraw} />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href={`/portal/elections/${ctx.election.id}`} className="text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4 inline mr-1" /> Back to {ctx.election.name}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Submit Nomination</h1>
        <p className="text-sm text-slate-500 mt-1">
          {ctx.election.name} · Nominations close: {new Date(ctx.election.nominationEndAt).toLocaleString()}
        </p>
      </div>

      {/* Existing nominations */}
      {ctx.myNominations.length > 0 && (
        <MyNominationsList nominations={ctx.myNominations} positions={ctx.positions} onWithdraw={handleWithdraw} />
      )}

      {/* Nomination form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>New Nomination</span>
            <Badge variant="outline">{remainingSlots} of {ctx.election.maxPositionsPerCandidate} remaining</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {availablePositions.length === 0 ? (
            <p className="text-sm text-slate-500">
              You have already nominated for all available positions. Withdraw one to nominate for a different position.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Position selection */}
              <div>
                <Label>Select Position *</Label>
                <div className="mt-2 space-y-2">
                  {availablePositions.map((p) => (
                    <label
                      key={p.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedPositionId === p.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="positionRadio"
                        checked={selectedPositionId === p.id}
                        onChange={() => setSelectedPositionId(p.id)}
                        className="mt-1 h-4 w-4 accent-indigo-600"
                      />
                      <div>
                        <p className="font-medium text-slate-900">{p.name}</p>
                        <p className="text-xs text-slate-500">{p.seatCount} seat(s) · Code: {p.code}</p>
                        {p.description && <p className="text-sm text-slate-600 mt-1">{p.description}</p>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Candidate statement (max 1000) */}
              <div>
                <Label htmlFor="statement">Candidate Statement <span className="text-slate-400">(max 1000 chars)</span></Label>
                <Textarea id="statement" name="statement" rows={3} maxLength={1000}
                  placeholder="Brief introduction of yourself and why you are contesting this position." />
              </div>

              {/* Vision/Manifesto (max 3000) */}
              <div>
                <Label htmlFor="manifesto">Vision / Manifesto <span className="text-slate-400">(max 3000 chars)</span></Label>
                <Textarea id="manifesto" name="manifesto" rows={5} maxLength={3000}
                  placeholder="Your plans and goals if elected." />
              </div>

              {/* Experience (max 2000) */}
              <div>
                <Label htmlFor="experience">Experience <span className="text-slate-400">(max 2000 chars)</span></Label>
                <Textarea id="experience" name="experience" rows={4} maxLength={2000}
                  placeholder="Relevant experience, qualifications, past contributions to the Somiti." />
              </div>

              {/* Supporting info (max 1000) */}
              <div>
                <Label htmlFor="supportingInfo">Supporting Information <span className="text-slate-400">(max 1000 chars)</span></Label>
                <Textarea id="supportingInfo" name="supportingInfo" rows={3} maxLength={1000}
                  placeholder="Any additional information you want voters to know." />
              </div>

              {/* Declaration */}
              <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={declaration}
                  onChange={(e) => setDeclaration(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-indigo-600"
                />
                <span className="text-sm text-slate-700">
                  I declare that I am eligible to contest this election and that the information submitted by me is accurate.
                </span>
              </label>

              <div className="flex justify-end gap-2">
                <Link href={`/portal/elections/${ctx.election.id}`}>
                  <Button type="button" variant="outline">Cancel</Button>
                </Link>
                <Button type="submit" disabled={!selectedPositionId || !declaration || submitting}>
                  <Send className="h-4 w-4 mr-2" /> {submitting ? "Submitting..." : "Submit Nomination"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function MyNominationsList({
  nominations,
  positions,
  onWithdraw,
}: {
  nominations: Array<{ id: string; positionId: string; status: string; submittedAt: string | null }>
  positions: Array<{ id: string; name: string }>
  onWithdraw: (id: string) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-400" /> My Nominations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-slate-100">
          {nominations.map((n) => {
            const pos = positions.find((p) => p.id === n.positionId)
            const canWithdraw = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(n.status)
            return (
              <li key={n.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{pos?.name || "Unknown position"}</p>
                  <p className="text-xs text-slate-500">
                    Submitted: {n.submittedAt ? new Date(n.submittedAt).toLocaleString() : "Not yet submitted"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={STATUS_TONES[n.status] || ""}>
                    {n.status.replace(/_/g, " ")}
                  </Badge>
                  {n.status === "APPROVED" && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  )}
                  {canWithdraw && (
                    <Button size="sm" variant="ghost" onClick={() => onWithdraw(n.id)}>
                      Withdraw
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
