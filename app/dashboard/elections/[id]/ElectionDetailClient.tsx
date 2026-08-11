/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  openNominations, closeNominations, finalizeCandidates, openVoting, closeVoting,
  countElectionVotes, publishResults, publishPositionResults, formCommittee,
  freezeElection, unfreezeElection, cancelElection, reopenVoting,
  addPosition, deletePosition, approveCandidate, rejectCandidate, disqualifyCandidate,
  overrideEligibility, assignObserver, createRunoffElection,
  requestRecount, deleteDraftElection, saveEligibilityConfig, previewEligibility,
} from "@/app/actions/elections"
import { toast } from "sonner"
import Link from "next/link"
import {
  ArrowLeft, Play, Pause, Lock, Unlock, X, Check, Trash2, Snowflake, RefreshCw,
  Award, FileCheck, Vote, Users, Shield, Settings as SettingsIcon, AlertTriangle,
  Plus, Eye, UserCheck, UserX, Sparkles, Hash, BarChart3, FileText,
} from "lucide-react"

interface Data {
  election: any
  auditLogs: any[]
  monitor: any | null
  candidatesByPosition: any[]
  eligibilityConfig: any
}

const STATUS_TONES: Record<string, string> = {
  DRAFT: "from-slate-400 to-slate-600",
  NOMINATION_OPEN: "from-blue-400 to-blue-600",
  NOMINATION_CLOSED: "from-amber-400 to-amber-600",
  CANDIDATES_FINALIZED: "from-purple-400 to-purple-600",
  VOTING_SCHEDULED: "from-cyan-400 to-cyan-600",
  VOTING_OPEN: "from-emerald-400 to-emerald-600",
  VOTING_CLOSED: "from-orange-400 to-orange-600",
  COUNTING: "from-yellow-400 to-yellow-600",
  RESULTS_READY: "from-teal-400 to-teal-600",
  RUNOFF_REQUIRED: "from-rose-400 to-rose-600",
  RESULTS_PUBLISHED: "from-green-400 to-green-600",
  COMMITTEE_FORMED: "from-indigo-400 to-indigo-600",
  ARCHIVED: "from-slate-300 to-slate-500",
  CANCELLED: "from-red-400 to-red-600",
  FROZEN: "from-gray-400 to-gray-600",
}

export default function ElectionDetailClient({ data, canManage, canReview }: { data: Data; canManage: boolean; canReview: boolean }) {
  const { election, auditLogs, monitor, candidatesByPosition, eligibilityConfig } = data
  const [tab, setTab] = useState("overview")
  const [busy, setBusy] = useState<string | null>(null)

  async function run(action: string, fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>) {
    setBusy(action)
    const r = await fn()
    setBusy(null)
    if (r.ok) {
      toast.success("Done.")
      window.location.reload()
    } else {
      toast.error(r.error || "Failed.")
    }
  }

  const statusGradient = STATUS_TONES[election.status] || "from-slate-400 to-slate-600"

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header card with gradient */}
      <div className={`rounded-2xl bg-gradient-to-r ${statusGradient} p-6 text-white shadow-lg`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/elections">
              <Button variant="ghost" size="icon" className="bg-white/20 hover:bg-white/30 text-white">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold tracking-tight">{election.name}</h1>
                {election.isTestElection && (
                  <span className="px-2 py-0.5 rounded-full bg-white/25 text-xs font-semibold">🧪 TEST</span>
                )}
              </div>
              <p className="text-sm text-white/80 font-mono">{election.code} · {election.status.replace(/_/g, " ")}</p>
            </div>
          </div>
          {canManage && (
            <div className="flex gap-1 flex-wrap">
              <LifecycleButtons election={election} busy={busy} run={run} />
            </div>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto bg-slate-100">
          <TabsTrigger value="overview" className="gap-1.5"><BarChart3 className="h-4 w-4" /> Overview</TabsTrigger>
          <TabsTrigger value="positions" className="gap-1.5"><Users className="h-4 w-4" /> Positions</TabsTrigger>
          <TabsTrigger value="candidates" className="gap-1.5"><UserCheck className="h-4 w-4" /> Candidates</TabsTrigger>
          <TabsTrigger value="eligibility" className="gap-1.5"><Shield className="h-4 w-4" /> Eligibility</TabsTrigger>
          <TabsTrigger value="monitor" className="gap-1.5"><Vote className="h-4 w-4" /> Monitor</TabsTrigger>
          <TabsTrigger value="results" className="gap-1.5"><Award className="h-4 w-4" /> Results</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5"><FileText className="h-4 w-4" /> Audit</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5"><SettingsIcon className="h-4 w-4" /> Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4"><OverviewTab election={election} /></TabsContent>
        <TabsContent value="positions" className="mt-4"><PositionsTab election={election} canManage={canManage} busy={busy} run={run} /></TabsContent>
        <TabsContent value="candidates" className="mt-4"><CandidatesTab election={election} candidatesByPosition={candidatesByPosition} canReview={canReview} busy={busy} run={run} /></TabsContent>
        <TabsContent value="eligibility" className="mt-4"><EligibilityTab election={election} config={eligibilityConfig} canManage={canManage} /></TabsContent>
        <TabsContent value="monitor" className="mt-4"><MonitorTab monitor={monitor} election={election} canManage={canManage} busy={busy} run={run} /></TabsContent>
        <TabsContent value="results" className="mt-4"><ResultsTab election={election} canManage={canManage} busy={busy} run={run} /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditTab auditLogs={auditLogs} /></TabsContent>
        <TabsContent value="settings" className="mt-4"><SettingsTab election={election} canManage={canManage} busy={busy} run={run} /></TabsContent>
      </Tabs>
    </div>
  )
}

function LifecycleButtons({ election, busy, run }: any) {
  const s = election.status
  return (
    <>
      {s === "DRAFT" && (
        <Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0" disabled={busy === "open-nom"} onClick={() => run("open-nom", () => openNominations(election.id))}>
          <Play className="h-4 w-4 mr-1" /> Open Nominations
        </Button>
      )}
      {s === "NOMINATION_OPEN" && (
        <Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0" disabled={busy === "close-nom"} onClick={() => run("close-nom", () => closeNominations(election.id))}>
          <Pause className="h-4 w-4 mr-1" /> Close Nominations
        </Button>
      )}
      {s === "NOMINATION_CLOSED" && (
        <Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0" disabled={busy === "finalize"} onClick={() => run("finalize", () => finalizeCandidates(election.id))}>
          <FileCheck className="h-4 w-4 mr-1" /> Finalize Candidates
        </Button>
      )}
      {(s === "CANDIDATES_FINALIZED" || s === "VOTING_SCHEDULED") && (
        <Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0" disabled={busy === "open-vote"} onClick={() => run("open-vote", () => openVoting(election.id))}>
          <Vote className="h-4 w-4 mr-1" /> Open Voting
        </Button>
      )}
      {s === "VOTING_OPEN" && (
        <Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0" disabled={busy === "close-vote"} onClick={() => run("close-vote", () => closeVoting(election.id))}>
          <Pause className="h-4 w-4 mr-1" /> Close Voting
        </Button>
      )}
      {(s === "VOTING_CLOSED" || s === "RESULTS_READY" || s === "RUNOFF_REQUIRED") && (
        <Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0" disabled={busy === "count"} onClick={() => run("count", () => countElectionVotes(election.id))}>
          <RefreshCw className="h-4 w-4 mr-1" /> Count Votes
        </Button>
      )}
      {(s === "RESULTS_READY" || s === "RUNOFF_REQUIRED") && (
        <Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0" disabled={busy === "publish"} onClick={() => run("publish", () => publishResults(election.id))}>
          <Check className="h-4 w-4 mr-1" /> Publish Results
        </Button>
      )}
      {s === "RESULTS_PUBLISHED" && (
        <Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0" disabled={busy === "form"} onClick={() => run("form", () => formCommittee(election.id))}>
          <Award className="h-4 w-4 mr-1" /> Form Committee
        </Button>
      )}
      {s !== "FROZEN" && s !== "CANCELLED" && s !== "ARCHIVED" && s !== "COMMITTEE_FORMED" && (
        <Button size="sm" variant="ghost" className="bg-white/20 hover:bg-white/30 text-white border-0" disabled={busy === "freeze"} onClick={() => {
          const reason = prompt("Reason for freezing:")
          if (reason) run("freeze", () => freezeElection(election.id, reason))
        }}>
          <Snowflake className="h-4 w-4" />
        </Button>
      )}
      {s === "FROZEN" && (
        <Button size="sm" variant="ghost" className="bg-white/20 hover:bg-white/30 text-white border-0" disabled={busy === "unfreeze"} onClick={() => {
          const reason = prompt("Reason for unfreezing:")
          if (reason) run("unfreeze", () => unfreezeElection(election.id, reason))
        }}>
          <Unlock className="h-4 w-4" />
        </Button>
      )}
      {s === "DRAFT" && (
        <Button size="sm" variant="ghost" className="bg-white/20 hover:bg-white/30 text-white border-0" disabled={busy === "delete"} onClick={() => {
          if (confirm("Delete this draft election? This cannot be undone.")) run("delete", () => deleteDraftElection(election.id))
        }}>
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </>
  )
}

function OverviewTab({ election }: { election: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <GradientCard title="Election Details" icon={FileText} gradient="from-blue-500 to-indigo-600">
        <dl className="text-sm space-y-2">
          <Row label="Code" value={election.code} />
          <Row label="Name" value={election.name} />
          <Row label="Status" value={election.status.replace(/_/g, " ")} />
          <Row label="Test Election" value={election.isTestElection ? "Yes" : "No"} />
          <Row label="Term" value={`${new Date(election.termStartDate).toLocaleDateString()} → ${new Date(election.termEndDate).toLocaleDateString()}`} />
          <Row label="Nomination" value={`${new Date(election.nominationStartAt).toLocaleString()} → ${new Date(election.nominationEndAt).toLocaleString()}`} />
          <Row label="Voting" value={`${new Date(election.votingStartAt).toLocaleString()} → ${new Date(election.votingEndAt).toLocaleString()}`} />
        </dl>
      </GradientCard>
      <GradientCard title="Configuration" icon={SettingsIcon} gradient="from-purple-500 to-pink-600">
        <dl className="text-sm space-y-2">
          <Row label="Ballot Mode" value={election.ballotStorageMode} />
          <Row label="Tie-Break" value={election.tieBreakingMethod.replace(/_/g, " ")} />
          <Row label="Quorum Required" value={election.quorumRequired ? `Yes (${election.minTurnoutPercentage || 0}%)` : "No"} />
          <Row label="Max Positions/Candidate" value={String(election.maxPositionsPerCandidate)} />
          <Row label="Show Live Results" value={election.showLiveResults ? "Yes" : "No"} />
          <Row label="Secret Ballot" value={election.secretBallot ? "Yes" : "No"} />
          <Row label="Allow Self Nomination" value={election.allowSelfNomination ? "Yes" : "No"} />
        </dl>
      </GradientCard>
      <GradientCard title="Integrity Hashes" icon={Hash} gradient="from-emerald-500 to-teal-600">
        <dl className="text-sm space-y-2">
          <Row label="Candidate List Hash" value={election.candidateListHash ? election.candidateListHash.slice(0, 16) + "…" : "—"} mono />
          <Row label="Eligibility Snapshot Hash" value={election.eligibilitySnapshotHash ? election.eligibilitySnapshotHash.slice(0, 16) + "…" : "—"} mono />
          <Row label="Result Hash" value={election.resultHash ? election.resultHash.slice(0, 16) + "…" : "—"} mono />
        </dl>
      </GradientCard>
      <GradientCard title="Counts" icon={BarChart3} gradient="from-amber-500 to-orange-600">
        <dl className="text-sm space-y-2">
          <Row label="Positions" value={String(election._count?.positions || 0)} />
          <Row label="Candidates" value={String(election._count?.candidates || 0)} />
          <Row label="Ballots Cast" value={String(election._count?.ballots || 0)} />
          <Row label="Participation Records" value={String(election._count?.participation || 0)} />
          <Row label="Audit Events" value={String(election._count?.auditLogs || 0)} />
        </dl>
      </GradientCard>
      {election.parentElection && (
        <GradientCard title="Runoff Origin" icon={AlertTriangle} gradient="from-rose-500 to-red-600">
          <p className="text-sm">This is a runoff election for position{" "}
            <Link href={`/dashboard/elections/${election.parentElection.id}`} className="text-white underline">
              {election.parentElection.code}
            </Link>
          </p>
        </GradientCard>
      )}
      {election.runoffElections?.length > 0 && (
        <GradientCard title="Runoff Elections" icon={RefreshCw} gradient="from-cyan-500 to-blue-600">
          <ul className="text-sm space-y-1">
            {election.runoffElections.map((r: any) => (
              <li key={r.id}>
                <Link href={`/dashboard/elections/${r.id}`} className="text-white underline">{r.code}</Link>
                <span className="text-white/70"> — {r.status.replace(/_/g, " ")}</span>
              </li>
            ))}
          </ul>
        </GradientCard>
      )}
    </div>
  )
}

function PositionsTab({ election, canManage, busy, run }: any) {
  const [showForm, setShowForm] = useState(false)
  const configEditable = election.status === "DRAFT" || election.status === "NOMINATION_OPEN"
  return (
    <div className="space-y-4">
      {canManage && configEditable && (
        <Button onClick={() => setShowForm(!showForm)} className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="h-4 w-4 mr-2" /> {showForm ? "Cancel" : "Add Position"}
        </Button>
      )}
      {showForm && (
        <form className="rounded-xl border border-slate-200 p-4 grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50" onSubmit={async (e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          await run("add-pos", () => addPosition(election.id, fd))
          setShowForm(false)
        }}>
          <div><Label>Name</Label><Input name="name" required /></div>
          <div><Label>Code</Label><Input name="code" required /></div>
          <div><Label>Seats</Label><Input name="seatCount" type="number" min={1} defaultValue={1} required /></div>
          <div><Label>Max Selections</Label><Input name="maxSelections" type="number" min={1} defaultValue={1} required /></div>
          <div><Label>Min Selections</Label><Input name="minSelections" type="number" min={0} defaultValue={1} required /></div>
          <div><Label>Display Order</Label><Input name="displayOrder" type="number" min={0} defaultValue={0} /></div>
          <div>
            <Label>Uncontested Policy</Label>
            <Select name="uncontestedPolicy" defaultValue="AUTO_ELECT">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="AUTO_ELECT">Auto-elect (uncontested candidates win without a vote)</SelectItem>
                <SelectItem value="STILL_REQUIRE_VOTE">Still require vote (candidate must beat NOTA)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end"><Button type="submit" disabled={busy === "add-pos"}>Add Position</Button></div>
        </form>
      )}
      <div className="grid gap-3">
        {election.positions.map((p: any) => (
          <div key={p.id} className="rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow bg-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 text-sm font-bold">{p.displayOrder}</span>
                  <div>
                    <p className="font-semibold text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500 font-mono">{p.code}</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge className="bg-blue-50 text-blue-700 border-blue-200">{p.seatCount} seat(s)</Badge>
                  <Badge className="bg-purple-50 text-purple-700 border-purple-200">{p._count?.candidates || 0} candidates</Badge>
                  {p.showNOTA && <Badge className="bg-amber-50 text-amber-700 border-amber-200">NOTA</Badge>}
                  {p.isRequired && <Badge className="bg-rose-50 text-rose-700 border-rose-200">Required</Badge>}
                  <Badge className="bg-slate-100 text-slate-700 border-slate-200">{p.uncontestedPolicy.replace(/_/g, " ")}</Badge>
                </div>
              </div>
              {canManage && configEditable && (
                <Button size="sm" variant="ghost" disabled={busy === `del-pos-${p.id}`} onClick={() => {
                  if (confirm(`Delete position "${p.name}"?`)) run(`del-pos-${p.id}`, () => deletePosition(election.id, p.id))
                }}>
                  <Trash2 className="h-4 w-4 text-rose-500" />
                </Button>
              )}
            </div>
          </div>
        ))}
        {election.positions.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-500">
            No positions configured yet. {canManage && configEditable && "Click \"Add Position\" to create one."}
          </div>
        )}
      </div>
    </div>
  )
}

function CandidatesTab({ election, candidatesByPosition, canReview, busy, run }: any) {
  if (!candidatesByPosition || candidatesByPosition.length === 0) {
    return <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-500">No positions configured.</div>
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Candidates are created automatically when a member submits a nomination. Review the full nomination content (statement, manifesto, experience) before approving.
      </p>
      {candidatesByPosition.map((pos: any) => (
        <div key={pos.id} className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2.5 text-white flex items-center justify-between">
            <span className="font-semibold">{pos.name}</span>
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{pos.candidates.length} candidate(s)</span>
          </div>
          {pos.candidates.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">No candidates nominated for this position yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pos.candidates.map((c: any) => (
                <CandidateRow key={c.id} election={election} candidate={c} canReview={canReview} busy={busy} run={run} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function CandidateRow({ election, candidate: c, canReview, busy, run }: any) {
  const [expanded, setExpanded] = useState(false)
  const nom = c.nomination
  const statusColors: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-800 border-amber-300",
    APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-300",
    REJECTED: "bg-red-100 text-red-800 border-red-300",
    DISQUALIFIED: "bg-red-100 text-red-800 border-red-300",
    WITHDRAWN: "bg-slate-100 text-slate-600 border-slate-300",
    UNCONTESTED_ELECTED: "bg-purple-100 text-purple-800 border-purple-300",
  }
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 shrink-0 flex items-center justify-center">
            {c.member?.photoUrl || nom?.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={(c.member?.photoUrl || nom?.photoUrl) as string} alt={c.member?.fullName} className="w-full h-full object-cover" />
            ) : (
              <Users className="h-5 w-5 text-slate-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900">{c.member?.fullName}</p>
            <p className="text-xs text-slate-500">
              {c.member?.memberNo} · Member since {c.member?.membershipDate ? new Date(c.member.membershipDate).toLocaleDateString() : "—"}
              {c.member?.trustScore != null && ` · Trust: ${c.member.trustScore}`}
            </p>
            <Badge variant="outline" className={`mt-1 ${statusColors[c.status] || "bg-slate-100"}`}>
              {c.status.replace(/_/g, " ")}
            </Badge>
            {nom?.statement && (
              <p className="text-sm text-slate-600 mt-2 line-clamp-2">{nom.statement}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(nom?.manifesto || nom?.experience || nom?.supportingInfo) && (
            <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>
              <Eye className="h-4 w-4" /> {expanded ? "Hide" : "View"}
            </Button>
          )}
          {canReview && c.status === "PENDING" && (
            <>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy === `appr-${c.id}`} onClick={() => run(`appr-${c.id}`, () => approveCandidate(election.id, c.id))}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="destructive" disabled={busy === `rej-${c.id}`} onClick={() => {
                const reason = prompt("Rejection reason:")
                if (reason) run(`rej-${c.id}`, () => rejectCandidate(election.id, c.id, reason))
              }}>
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
          {canReview && c.status === "APPROVED" && (
            <Button size="sm" variant="outline" disabled={busy === `disq-${c.id}`} onClick={() => {
              const reason = prompt("Disqualification reason:")
              if (reason) run(`disq-${c.id}`, () => disqualifyCandidate(election.id, c.id, reason))
            }}>
              <UserX className="h-3 w-3 mr-1" /> Disqualify
            </Button>
          )}
        </div>
      </div>
      {expanded && nom && (
        <div className="mt-3 ml-13 pl-13 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {nom.statement && <Field label="Candidate Statement" value={nom.statement} />}
          {nom.manifesto && <Field label="Vision / Manifesto" value={nom.manifesto} />}
          {nom.experience && <Field label="Experience" value={nom.experience} />}
          {nom.supportingInfo && <Field label="Supporting Information" value={nom.supportingInfo} />}
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-slate-700 whitespace-pre-wrap">{value}</p>
    </div>
  )
}

function EligibilityTab({ election, config, canManage }: { election: any; config: any; canManage: boolean }) {
  const configEditable = election.status === "DRAFT" || election.status === "NOMINATION_OPEN"
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 p-5 text-white">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-5 w-5" />
          <h2 className="font-semibold">Eligibility Rules</h2>
        </div>
        <p className="text-sm text-white/90">
          Configure separate rule sets for <strong>Voters</strong> (who can cast a ballot) and <strong>Candidates</strong> (who can submit a nomination).
          Rules are evaluated live during the nomination period and frozen into a snapshot when candidates are finalized.
          {!configEditable && <span className="block mt-1 text-amber-200">⚠ Rules are locked — election has progressed past the nomination phase.</span>}
        </p>
      </div>
      <RuleBuilder
        title="Voter Eligibility"
        description="Who can cast a ballot in this election."
        icon={Vote}
        gradient="from-emerald-500 to-teal-600"
        electionId={election.id}
        initialRules={config?.voter}
        canEdit={canManage && configEditable}
      />
      <RuleBuilder
        title="Candidate Eligibility"
        description="Who can submit a nomination to contest a position."
        icon={UserCheck}
        gradient="from-indigo-500 to-purple-600"
        electionId={election.id}
        initialRules={config?.candidate}
        canEdit={canManage && configEditable}
      />
      {canManage && (
        <div className="rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-500" /> Super Admin Override</h3>
          <p className="text-sm text-slate-500 mb-3">Override a single member&apos;s eligibility determination (only before voting opens).</p>
          <OverrideForm electionId={election.id} />
        </div>
      )}
    </div>
  )
}

function RuleBuilder({ title, description, icon: Icon, gradient, electionId, initialRules, canEdit }: any) {
  const [rules, setRules] = useState<any[]>(initialRules?.rules || [])
  const [combinator, setCombinator] = useState<"AND" | "OR">(initialRules?.combinator || "AND")
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<{ eligibleCount: number; ineligibleCount: number; totalChecked: number } | null>(null)
  const [previewing, setPreviewing] = useState(false)

  function addRule(type: string) {
    const meta = RULE_TYPES.find((r) => r.type === type)
    if (!meta) return
    setRules([...rules, { type, value: meta.valueDefault }])
  }
  function removeRule(idx: number) {
    setRules(rules.filter((_, i) => i !== idx))
  }
  function updateValue(idx: number, value: number) {
    setRules(rules.map((r, i) => (i === idx ? { ...r, value } : r)))
  }

  async function save() {
    setSaving(true)
    // Save both rule sets — the action expects the full config. We need to
    // fetch the current config first to preserve the other rule set.
    const { getEligibilityConfig } = await import("@/app/actions/elections")
    const current = await getEligibilityConfig(electionId)
    const isVoter = title === "Voter Eligibility"
    const newConfig = {
      voter: isVoter ? { rules, combinator } : current.voter,
      candidate: isVoter ? current.candidate : { rules, combinator },
    }
    const r = await saveEligibilityConfig(electionId, newConfig)
    setSaving(false)
    if (r.ok) toast.success("Eligibility rules saved.")
    else toast.error(r.error)
  }

  async function runPreview() {
    setPreviewing(true)
    const ruleSet = title === "Voter Eligibility" ? "voter" : "candidate"
    const r = await previewEligibility(electionId, ruleSet as any, { rules, combinator })
    setPreview(r)
    setPreviewing(false)
  }

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <div className={`bg-gradient-to-r ${gradient} px-5 py-3 text-white flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-xs text-white/80">{description}</p>
          </div>
        </div>
        <Select value={combinator} onValueChange={(v: string | null) => setCombinator((v as "AND" | "OR") || "AND")} disabled={!canEdit}>
          <SelectTrigger className="w-32 bg-white/20 border-white/30 text-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="AND">ALL must pass (AND)</SelectItem>
            <SelectItem value="OR">ANY must pass (OR)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="p-5 space-y-3">
        {rules.length === 0 && (
          <p className="text-sm text-slate-400 italic">No rules configured. All active members will be eligible.</p>
        )}
        {rules.map((r, idx) => {
          const meta = RULE_TYPES.find((m) => m.type === r.type)
          if (!meta) return null
          return (
            <div key={idx} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 bg-slate-50">
              <div className="flex-1">
                <p className="font-medium text-slate-900 text-sm">{meta.label}</p>
                <p className="text-xs text-slate-500">{meta.description}</p>
              </div>
              {meta.hasValue && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={r.value ?? meta.valueDefault ?? 0}
                    min={meta.valueMin}
                    max={meta.valueMax}
                    onChange={(e) => updateValue(idx, Number(e.target.value))}
                    disabled={!canEdit}
                    className="w-24"
                  />
                  <span className="text-xs text-slate-500">{meta.valueUnit}</span>
                </div>
              )}
              {canEdit && (
                <Button size="sm" variant="ghost" onClick={() => removeRule(idx)}>
                  <X className="h-4 w-4 text-rose-500" />
                </Button>
              )}
            </div>
          )
        })}
        {canEdit && (
          <div className="flex items-center gap-2 pt-2">
            <span className="text-sm text-slate-500">Add rule:</span>
            <Select onValueChange={(v: string | null) => v && addRule(v)}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Select rule type…" /></SelectTrigger>
              <SelectContent>
                {RULE_TYPES.map((m) => (
                  <SelectItem key={m.type} value={m.type}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {preview && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm">
            <p className="font-semibold text-blue-900">Preview (live evaluation):</p>
            <p className="text-blue-700">
              ✅ {preview.eligibleCount} eligible · ❌ {preview.ineligibleCount} ineligible · out of {preview.totalChecked} active/suspended members
            </p>
          </div>
        )}
        {canEdit && (
          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? "Saving…" : "Save Rules"}
            </Button>
            <Button variant="outline" onClick={runPreview} disabled={previewing}>
              {previewing ? "Checking…" : "Preview Eligibility"}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function OverrideForm({ electionId }: { electionId: string }) {
  const [memberId, setMemberId] = useState("")
  const [eligible, setEligible] = useState(true)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (!memberId || !reason) { toast.error("Member ID and reason are required."); return }
    setBusy(true)
    const r = await overrideEligibility(electionId, memberId, { eligible, reason })
    setBusy(false)
    if (r.ok) { toast.success("Override applied."); window.location.reload() }
    else toast.error(r.error)
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      <div><Label>Member ID</Label><Input value={memberId} onChange={(e) => setMemberId(e.target.value)} placeholder="Member UUID" /></div>
      <div>
        <Label>Eligible?</Label>
        <Select value={eligible ? "true" : "false"} onValueChange={(v: string | null) => setEligible(v === "true")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Eligible</SelectItem>
            <SelectItem value="false">Not Eligible</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Mandatory reason" /></div>
      <div className="md:col-span-4">
        <Button onClick={submit} disabled={busy}>Apply Override</Button>
      </div>
    </div>
  )
}

function MonitorTab({ monitor, election, canManage, busy, run }: any) {
  if (!monitor) return <p className="text-sm text-slate-500">Monitor unavailable.</p>
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Eligible Members" value={monitor.eligibleMembers} icon={Users} gradient="from-blue-500 to-indigo-600" />
        <StatCard label="Votes Cast" value={monitor.votesCast} icon={Check} gradient="from-emerald-500 to-teal-600" />
        <StatCard label="Remaining" value={monitor.remaining} icon={Vote} gradient="from-amber-500 to-orange-600" />
        <StatCard label="Invalid Ballots" value={monitor.invalidBallots} icon={AlertTriangle} gradient="from-rose-500 to-red-600" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Turnout" value={`${monitor.turnout}%`} icon={BarChart3} gradient="from-purple-500 to-pink-600" />
        <StatCard label="Quorum Threshold" value={`${monitor.quorumThreshold}%`} icon={Hash} gradient="from-cyan-500 to-blue-600" />
        <StatCard label="Quorum Status" value={monitor.quorumMet ? "MET" : "NOT MET"} icon={Shield} gradient={monitor.quorumMet ? "from-emerald-500 to-green-600" : "from-rose-500 to-red-600"} />
      </div>
      {canManage && monitor.votingStatus === "VOTING_CLOSED" && (
        <Button variant="outline" disabled={busy === "reopen"} onClick={() => {
          const reason = prompt("Reason for reopening voting:")
          if (reason) run("reopen", () => reopenVoting(election.id, reason))
        }}>
          <RefreshCw className="h-4 w-4 mr-2" /> Reopen Voting (Super Admin)
        </Button>
      )}
      <p className="text-xs text-slate-400">Per spec: this monitor never shows voter-to-candidate mappings. Only aggregate counts.</p>
    </div>
  )
}

function ResultsTab({ election, canManage, busy, run }: any) {
  const [results, setResults] = useState<any[] | null>(null)
  if (results === null) {
    import("@/app/actions/elections").then(async (m) => {
      const r = await (m as any).getElectionResults(election.id)
      setResults(r.published ? r.positions : [])
    })
    return <p className="text-sm text-slate-500">Loading results…</p>
  }
  if (results.length === 0) return <p className="text-sm text-slate-500">Results are not yet published.</p>
  return (
    <div className="space-y-4">
      {election.resultHash && (
        <div className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 p-5 text-white">
          <div className="flex items-center gap-2 mb-2"><Sparkles className="h-5 w-5" /><h3 className="font-semibold">Verification</h3></div>
          <p className="text-xs font-mono break-all text-white/90">Result Hash (SHA-256): {election.resultHash}</p>
          <div className="mt-3 flex gap-2 flex-wrap">
            <a href={`/api/elections/${election.id}/certificate`} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="bg-white/20 text-white border-white/30 hover:bg-white/30"><FileCheck className="h-4 w-4 mr-1" /> Certificate (PDF)</Button>
            </a>
            {canManage && (
              <Button variant="outline" size="sm" className="bg-white/20 text-white border-white/30 hover:bg-white/30" disabled={busy === "recount"} onClick={() => run("recount", () => requestRecount(election.id, "Verification recount"))}>
                <RefreshCw className="h-4 w-4 mr-1" /> Recount
              </Button>
            )}
          </div>
        </div>
      )}
      {results.map((p: any) => (
        <div key={p.id} className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-white font-semibold flex items-center justify-between">
            <span>{p.name}</span>
            {canManage && !p.resultsPublished && (
              <Button size="sm" variant="ghost" className="bg-white/20 text-white hover:bg-white/30" disabled={busy === `pub-${p.id}`} onClick={() => run(`pub-${p.id}`, () => publishPositionResults(election.id, p.id))}>
                Publish Position
              </Button>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Rank</th>
                <th className="text-left px-4 py-2 font-medium">Candidate</th>
                <th className="text-right px-4 py-2 font-medium">Votes</th>
                <th className="text-right px-4 py-2 font-medium">%</th>
                <th className="text-center px-4 py-2 font-medium">Elected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(p.results || []).map((r: any) => (
                <tr key={r.id} className={r.elected ? "bg-emerald-50" : ""}>
                  <td className="px-4 py-2">{r.rank}</td>
                  <td className="px-4 py-2 font-medium">{r.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.voteCount}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Number(r.votePercentage).toFixed(1)}%</td>
                  <td className="px-4 py-2 text-center">{r.elected && <Check className="h-4 w-4 text-emerald-600 mx-auto" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function AuditTab({ auditLogs }: { auditLogs: any[] }) {
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Time</th>
            <th className="text-left px-4 py-2 font-medium">Action</th>
            <th className="text-left px-4 py-2 font-medium">Role</th>
            <th className="text-left px-4 py-2 font-medium">IP</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {auditLogs.map((l) => (
            <tr key={l.id}>
              <td className="px-4 py-2 text-xs">{new Date(l.createdAt).toLocaleString()}</td>
              <td className="px-4 py-2 font-mono text-xs">{l.action}</td>
              <td className="px-4 py-2 text-xs">{l.performedByRole || "—"}</td>
              <td className="px-4 py-2 text-xs">{l.ipAddress || "—"}</td>
            </tr>
          ))}
          {auditLogs.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No audit events yet.</td></tr>}
        </tbody>
      </table>
      <p className="px-4 py-2 text-xs text-slate-400 bg-slate-50">Audit logs are append-only. No UI exists to edit or delete them (spec §71).</p>
    </div>
  )
}

function SettingsTab({ election, canManage, busy, run }: any) {
  return (
    <div className="space-y-4">
      <GradientCard title="Observer Management" icon={Eye} gradient="from-cyan-500 to-blue-600">
        <ObserverManager electionId={election.id} canManage={canManage} busy={busy} run={run} />
      </GradientCard>
      <GradientCard title="Runoff / Tie Resolution" icon={RefreshCw} gradient="from-rose-500 to-red-600">
        <p className="text-sm text-slate-500 mb-3">If a tie was detected during counting, create a runoff election here.</p>
        <RunoffManager election={election} canManage={canManage} busy={busy} run={run} />
      </GradientCard>
      <GradientCard title="Cancel Election" icon={X} gradient="from-red-500 to-rose-600">
        <p className="text-sm text-slate-500 mb-3">Cancellation is Super-Admin-only and only allowed before voting begins (spec §76).</p>
        {canManage && (
          <Button variant="destructive" disabled={busy === "cancel"} onClick={() => {
            const reason = prompt("Reason for cancellation:")
            if (reason) run("cancel", () => cancelElection(election.id, reason))
          }}>
            <X className="h-4 w-4 mr-2" /> Cancel Election
          </Button>
        )}
      </GradientCard>
    </div>
  )
}

function ObserverManager({ electionId, canManage, busy, run }: any) {
  const [userId, setUserId] = useState("")
  const [expiresAt, setExpiresAt] = useState("")
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Observers get read-only access with no exposure of individual vote choices (spec §31.1).</p>
      {canManage && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><Label>User ID</Label><Input value={userId} onChange={(e) => setUserId(e.target.value)} /></div>
          <div><Label>Expires At</Label><Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></div>
          <div className="flex items-end">
            <Button disabled={busy === "obs" || !userId || !expiresAt} onClick={() => run("obs", () => assignObserver(electionId, { userId, expiresAt: new Date(expiresAt) }))}>
              Assign
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function RunoffManager({ election, canManage, busy, run }: any) {
  const [positionId, setPositionId] = useState("")
  const [candidateIds, setCandidateIds] = useState("")
  const [votingStartAt, setVotingStartAt] = useState("")
  const [votingEndAt, setVotingEndAt] = useState("")
  return (
    <div className="space-y-3">
      {canManage && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Position</Label>
              <Select value={positionId} onValueChange={(v: string | null) => setPositionId(v || "")}>
                <SelectTrigger><SelectValue placeholder="Select position" /></SelectTrigger>
                <SelectContent>
                  {election.positions.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Tied Candidate IDs (comma-separated)</Label><Input value={candidateIds} onChange={(e) => setCandidateIds(e.target.value)} /></div>
            <div><Label>Voting Start</Label><Input type="datetime-local" value={votingStartAt} onChange={(e) => setVotingStartAt(e.target.value)} /></div>
            <div><Label>Voting End</Label><Input type="datetime-local" value={votingEndAt} onChange={(e) => setVotingEndAt(e.target.value)} /></div>
          </div>
          <Button disabled={busy === "runoff" || !positionId || !candidateIds || !votingStartAt || !votingEndAt} onClick={() => run("runoff", () => createRunoffElection(election.id, {
            positionId,
            candidateIds: candidateIds.split(",").map((s) => s.trim()).filter(Boolean),
            votingStartAt: new Date(votingStartAt),
            votingEndAt: new Date(votingEndAt),
          }))}>
            Create Runoff Election
          </Button>
        </>
      )}
    </div>
  )
}

// ── Reusable UI bits ─────────────────────────────────────────────────────────
function GradientCard({ title, icon: Icon, gradient, children }: { title: string; icon: any; gradient: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <div className={`bg-gradient-to-r ${gradient} px-5 py-3 text-white flex items-center gap-2`}>
        <Icon className="h-5 w-5" />
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, gradient }: { label: string; value: any; icon: any; gradient: string }) {
  return (
    <div className={`rounded-xl bg-gradient-to-br ${gradient} p-5 text-white shadow-md`}>
      <Icon className="h-6 w-6 mb-2 opacity-80" />
      <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-right ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  )
}

// ── Rule types (mirrored from lib/elections/eligibility.ts for the UI) ───────
const RULE_TYPES = [
  { type: "MEMBER_ACTIVE", label: "Active Member", description: "Member status must be ACTIVE", hasValue: false },
  { type: "NOT_SUSPENDED", label: "Not Suspended", description: "Member must not be suspended", hasValue: false },
  { type: "NOT_TERMINATED", label: "Not Terminated", description: "Member must not be terminated", hasValue: false },
  { type: "KYC_VERIFIED", label: "KYC Verified", description: "Member's KYC must be verified", hasValue: false },
  { type: "MIN_MEMBERSHIP_MONTHS", label: "Minimum Membership Duration", description: "Member must have been a member for at least N months", hasValue: true, valueLabel: "Months", valueUnit: "months", valueMin: 0, valueMax: 600, valueDefault: 6 },
  { type: "MIN_TRUST_SCORE", label: "Minimum Trust Score", description: "Member's trust score must be at least N (0-100)", hasValue: true, valueLabel: "Score", valueUnit: "/ 100", valueMin: 0, valueMax: 100, valueDefault: 60 },
  { type: "MAX_OUTSTANDING_DUES", label: "Max Outstanding Dues", description: "Member's outstanding dues must not exceed N BDT", hasValue: true, valueLabel: "Amount", valueUnit: "BDT", valueMin: 0, valueMax: 1000000, valueDefault: 0 },
  { type: "MIN_AGE", label: "Minimum Age", description: "Member must be at least N years old", hasValue: true, valueLabel: "Age", valueUnit: "years", valueMin: 18, valueMax: 120, valueDefault: 20 },
  { type: "MAX_AGE", label: "Maximum Age", description: "Member must be at most N years old", hasValue: true, valueLabel: "Age", valueUnit: "years", valueMin: 18, valueMax: 120, valueDefault: 60 },
]
