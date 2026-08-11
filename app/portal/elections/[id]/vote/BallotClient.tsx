"use client"
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Lock, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

interface BallotData {
  election: { id: string; name: string; votingEndAt: string }
  positions: Array<{
    id: string
    name: string
    seatCount: number
    maxSelections: number
    minSelections: number
    isRequired: boolean
    showNOTA: boolean
    allowSkip: boolean
    candidates: Array<{
      id: string
      member: { id: string; fullName: string; memberNo: string; photoUrl?: string }
      nomination?: { statement?: string } | null
    }>
  }>
}

function Alert({ children, variant }: { children: React.ReactNode; variant?: "default" | "destructive" }) {
  return (
    <div className={`rounded-lg border p-3 flex items-start gap-2 text-sm ${variant === "destructive" ? "border-red-300 bg-red-50 text-red-800" : "border-blue-300 bg-blue-50 text-blue-800"}`}>
      {children}
    </div>
  )
}

export default function BallotClient({ electionId, ballot }: { electionId: string; ballot: BallotData }) {
  const router = useRouter()
  // selections: positionId → Set<candidateId | "NOTA">
  const [selections, setSelections] = useState<Record<string, Set<string>>>({})
  const [step, setStep] = useState<"ballot" | "review" | "confirm">("ballot")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)

  function toggle(positionId: string, candidateId: string, multi: boolean) {
    setSelections((prev) => {
      const next = { ...prev }
      let set = new Set(next[positionId] || [])
      if (candidateId === "NOTA") {
        if (set.has("NOTA")) {
          set = new Set()
        } else {
          set = new Set(["NOTA"])
        }
      } else if (multi) {
        set.delete("NOTA")
        if (set.has(candidateId)) set.delete(candidateId)
        else set.add(candidateId)
      } else {
        set = new Set([candidateId])
      }
      next[positionId] = set
      return next
    })
  }

  const validation = useMemo(() => {
    const errors: string[] = []
    for (const p of ballot.positions) {
      const sel = selections[p.id] || new Set<string>()
      if (p.isRequired && sel.size === 0 && !p.allowSkip) {
        errors.push(`"${p.name}" is required.`)
      }
      if (sel.size > p.maxSelections) {
        errors.push(`"${p.name}": too many selections (max ${p.maxSelections}).`)
      }
    }
    return errors
  }, [selections, ballot.positions])

  function buildPayload() {
    return {
      selections: ballot.positions.map((p) => ({
        positionId: p.id,
        candidateIds: Array.from(selections[p.id] || []),
      })),
      confirmationToken: password,
    }
  }

  async function submitBallot() {
    setSubmitting(true)
    const idempotencyKey = crypto.randomUUID()
    try {
      const res = await fetch(`/api/elections/${electionId}/voting/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(buildPayload()),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error || "Failed to submit ballot.")
        setSubmitting(false)
        return
      }
      router.push(`/portal/elections/${electionId}/vote/success?ref=${json.data.ballotReference}`)
    } catch (e: any) {
      toast.error("Network error. Your ballot may or may not have been recorded. Check your voting status.")
      setSubmitting(false)
    }
  }

  if (step === "ballot") {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <Link href={`/portal/elections/${electionId}`} className="text-sm text-slate-500 hover:text-slate-700">← Back to election</Link>
          <h1 className="text-2xl font-bold tracking-tight mt-1">{ballot.election.name}</h1>
          <p className="text-sm text-slate-500">Cast your vote. Closes: {new Date(ballot.election.votingEndAt).toLocaleString()}</p>
        </div>

        <Alert>
          <Lock className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            Your vote is confidential. Selections are encrypted (AES-256-GCM) and cannot be linked back to you
            through the application. Your vote cannot be changed after submission.
          </div>
        </Alert>

        {ballot.positions.map((p, idx) => {
          const sel = selections[p.id] || new Set<string>()
          const multi = p.maxSelections > 1
          return (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{idx + 1}. {p.name}</span>
                  <span className="text-xs font-normal text-slate-500">
                    {p.seatCount} seat(s) · {multi ? `Select up to ${p.maxSelections}` : "Select one"}
                    {p.isRequired ? " · required" : " · optional"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {p.candidates.map((c) => {
                  const selected = sel.has(c.id)
                  return (
                    <label key={c.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selected ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
                      {multi ? (
                        <Checkbox checked={selected} onCheckedChange={() => toggle(p.id, c.id, true)} />
                      ) : (
                        <input
                          type="radio"
                          name={`pos-${p.id}`}
                          checked={selected}
                          onChange={() => toggle(p.id, c.id, false)}
                          className="mt-1 h-4 w-4 accent-indigo-600"
                        />
                      )}
                      <div className="flex-1">
                        <p className="font-medium">{c.member.fullName}</p>
                        <p className="text-xs text-slate-500">Member No: {c.member.memberNo}</p>
                        {c.nomination?.statement && <p className="text-sm text-slate-600 mt-1">{c.nomination.statement}</p>}
                      </div>
                    </label>
                  )
                })}
                {p.showNOTA && (
                  <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${sel.has("NOTA") ? "border-amber-500 bg-amber-50" : "border-slate-200 hover:bg-slate-50"}`}>
                    {multi ? (
                      <Checkbox checked={sel.has("NOTA")} onCheckedChange={() => toggle(p.id, "NOTA", true)} />
                    ) : (
                      <input
                        type="radio"
                        name={`pos-${p.id}`}
                        checked={sel.has("NOTA")}
                        onChange={() => toggle(p.id, "NOTA", false)}
                        className="mt-1 h-4 w-4 accent-indigo-600"
                      />
                    )}
                    <span className="font-medium">None of the Above (NOTA)</span>
                  </label>
                )}
                {p.allowSkip && !p.isRequired && (
                  <p className="text-xs text-slate-400">You may skip this position.</p>
                )}
              </CardContent>
            </Card>
          )
        })}

        {validation.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <ul className="list-disc pl-4">
                {validation.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          </Alert>
        )}

        <div className="flex justify-end">
          <Button disabled={validation.length > 0} onClick={() => setStep("review")}>
            Review Vote <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    )
  }

  if (step === "review") {
    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <Button variant="ghost" size="sm" onClick={() => setStep("ballot")}><ArrowLeft className="h-4 w-4 mr-1" /> Back to ballot</Button>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Review Your Vote</h1>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-3">
            {ballot.positions.map((p) => {
              const sel = Array.from(selections[p.id] || [])
              const labels = sel.map((id) => id === "NOTA" ? "NOTA" : p.candidates.find((c) => c.id === id)?.member.fullName || id)
              return (
                <div key={p.id} className="flex justify-between border-b border-slate-100 pb-2 last:border-0">
                  <span className="font-medium text-slate-700">{p.name}</span>
                  <span className="text-slate-900">{labels.length > 0 ? labels.join(", ") : "(skipped)"}</span>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>Your vote cannot be changed after final submission. Please verify your selections carefully.</div>
        </Alert>

        <div className="flex justify-end">
          <Button onClick={() => setStep("confirm")}>Continue to Confirmation <ArrowRight className="h-4 w-4 ml-1" /></Button>
        </div>
      </div>
    )
  }

  // step === "confirm"
  return (
    <div className="space-y-6 max-w-md">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Confirm Your Vote</h1>
        <p className="text-sm text-slate-500">Enter your password to confirm. This is the final step.</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <Label htmlFor="password">Account Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your member account password" />
            <p className="text-xs text-slate-500 mt-1">Used for Level 2 confirmation (spec §38). OTP support is planned.</p>
          </div>
          <Button className="w-full" disabled={!password || submitting} onClick={submitBallot}>
            {submitting ? "Submitting..." : "Submit Final Vote"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
