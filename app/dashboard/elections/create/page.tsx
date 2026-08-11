"use client"
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createElection } from "@/app/actions/elections"
import Link from "next/link"
import { ArrowLeft, Save } from "lucide-react"
import { toast } from "sonner"

export default function CreateElectionPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    const formData = new FormData(e.currentTarget)
    formData.set("allowSelfNomination", "true")
    formData.set("secretBallot", "true")
    formData.set("ballotStorageMode", "ENCRYPTED")
    formData.set("tieBreakingMethod", "RUNOFF_ELECTION")
    formData.set("maxPositionsPerCandidate", "1")
    const result = await createElection(formData)
    setSubmitting(false)
    if (result.ok) {
      toast.success("Election created.")
      router.push(`/dashboard/elections/${result.id}`)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/elections">
          <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Election</h1>
          <p className="text-sm text-slate-500">Configure a new Executive Committee election.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-semibold text-slate-900">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="code">Election Code *</Label>
              <Input id="code" name="code" placeholder="EC-ELECTION-2026" required />
              <p className="text-xs text-slate-500 mt-1">Unique identifier (e.g. EC-ELECTION-2026).</p>
            </div>
            <div>
              <Label htmlFor="name">Election Name *</Label>
              <Input id="name" name="name" placeholder="Executive Committee Election 2026–2028" required />
            </div>
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={2} placeholder="Brief description of this election." />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-semibold text-slate-900">Committee Term</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="termStartDate">Term Start Date *</Label>
              <Input id="termStartDate" name="termStartDate" type="datetime-local" required />
            </div>
            <div>
              <Label htmlFor="termEndDate">Term End Date *</Label>
              <Input id="termEndDate" name="termEndDate" type="datetime-local" required />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-semibold text-slate-900">Nomination Schedule</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="nominationStartAt">Nomination Start *</Label>
              <Input id="nominationStartAt" name="nominationStartAt" type="datetime-local" required />
            </div>
            <div>
              <Label htmlFor="nominationEndAt">Nomination End *</Label>
              <Input id="nominationEndAt" name="nominationEndAt" type="datetime-local" required />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-semibold text-slate-900">Voting Schedule</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="votingStartAt">Voting Start *</Label>
              <Input id="votingStartAt" name="votingStartAt" type="datetime-local" required />
            </div>
            <div>
              <Label htmlFor="votingEndAt">Voting End *</Label>
              <Input id="votingEndAt" name="votingEndAt" type="datetime-local" required />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Voting must complete before the committee term begins. All times are in Asia/Dhaka.
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-semibold text-slate-900">Election Rules</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="maxPositionsPerCandidate">Max Positions per Candidate</Label>
              <Input id="maxPositionsPerCandidate" name="maxPositionsPerCandidate" type="number" min={1} max={20} defaultValue={1} />
            </div>
            <div>
              <Label htmlFor="tieBreakingMethod">Tie-Breaking Method</Label>
              <Select name="tieBreakingMethod" defaultValue="RUNOFF_ELECTION">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RUNOFF_ELECTION">Runoff Election</SelectItem>
                  <SelectItem value="COMMITTEE_DECISION">Committee Decision</SelectItem>
                  <SelectItem value="LOTTERY_DRAW">Lottery Draw</SelectItem>
                  <SelectItem value="PREVIOUS_TERM">Previous Term</SelectItem>
                  <SelectItem value="SENIORITY">Seniority</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="minTurnoutPercentage">Min Turnout % (for quorum)</Label>
              <Input id="minTurnoutPercentage" name="minTurnoutPercentage" type="number" min={0} max={100} step="0.01" placeholder="50" />
            </div>
          </div>
          <div className="space-y-3 pt-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <Switch name="quorumRequired" value="true" />
              <span className="text-sm">Require quorum (min turnout)</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <Switch name="allowTermOverlap" value="true" />
              <span className="text-sm">Allow term overlap with other elections</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <Switch name="showLiveResults" value="true" />
              <span className="text-sm">Show live results during voting (off by default for confidentiality)</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <Switch name="isTestElection" value="true" />
              <span className="text-sm">Test election (hidden from members, hard-deletable)</span>
            </label>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Link href="/dashboard/elections"><Button type="button" variant="outline">Cancel</Button></Link>
          <Button type="submit" disabled={submitting}>
            <Save className="h-4 w-4 mr-2" /> {submitting ? "Creating..." : "Create Election"}
          </Button>
        </div>
      </form>
    </div>
  )
}
