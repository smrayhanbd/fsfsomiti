/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw, Award, ExternalLink } from "lucide-react"
import { syncCommitteeToLandingPage, getCommitteeForBioEdit, saveCommitteeBios } from "@/app/actions/elections"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import Link from "next/link"

interface CommitteeMember {
  id: string
  positionName: string
  shortBio: string | null
  displayOrder: number
  member: { id: string; fullName: string; photoUrl: string | null }
}

export default function CommitteeSyncPanel() {
  const [committee, setCommittee] = useState<any | null>(null)
  const [members, setMembers] = useState<CommitteeMember[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)

  async function loadCommittee() {
    setLoading(true)
    try {
      const c = await getCommitteeForBioEdit()
      if (!c) {
        toast.info("No active committee found. Form a committee from an election first.")
        setCommittee(null)
        setMembers([])
      } else {
        setCommittee(c)
        setMembers(c.members || [])
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to load committee.")
    }
    setLoading(false)
  }

  async function sync() {
    setSyncing(true)
    const r = await syncCommitteeToLandingPage()
    setSyncing(false)
    if (r.ok) {
      toast.success("Committee synced to landing page.")
      await loadCommittee()
    } else {
      toast.error(r.error)
    }
  }

  async function saveBios() {
    setSaving(true)
    const bios = members.map((m, i) => ({
      committeeMemberId: m.id,
      shortBio: m.shortBio || "",
      displayOrder: i,
    }))
    const r = await saveCommitteeBios(bios)
    setSaving(false)
    if (r.ok) toast.success("Bios saved. Landing page updated.")
    else toast.error(r.error)
  }

  function updateBio(id: string, bio: string) {
    setMembers(members.map((m) => (m.id === id ? { ...m, shortBio: bio } : m)))
  }

  function moveUp(idx: number) {
    if (idx === 0) return
    const next = [...members]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    setMembers(next)
  }
  function moveDown(idx: number) {
    if (idx === members.length - 1) return
    const next = [...members]
    ;[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]
    setMembers(next)
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 p-5 mb-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Award className="h-5 w-5 text-indigo-600" /> Elected Committee (Auto-Sync)
          </h3>
          <p className="text-sm text-slate-600 mt-1">
            When an election completes and the committee is formed, members appear here automatically.
            Edit their short bios and display order — changes reflect on the landing page instantly.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={loadCommittee} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading…" : "Load Committee"}
          </Button>
          {committee && (
            <Button size="sm" onClick={sync} disabled={syncing} className="bg-indigo-600 hover:bg-indigo-700">
              <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} /> Sync Now
            </Button>
          )}
        </div>
      </div>

      {committee && (
        <>
          <div className="rounded-lg bg-white/60 px-3 py-2 mb-3 text-sm">
            <span className="text-slate-500">Committee:</span>{" "}
            <span className="font-medium text-slate-900">{committee.name}</span>
            {committee.election && (
              <span className="text-slate-400"> · from {committee.election.name}</span>
            )}
            <span className="text-slate-400"> · {members.length} member(s)</span>
          </div>

          {members.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No active members in this committee.</p>
          ) : (
            <div className="space-y-3">
              {members.map((m, idx) => (
                <div key={m.id} className="rounded-lg border border-slate-200 bg-white p-3 flex gap-3">
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => moveUp(idx)} disabled={idx === 0}>↑</Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => moveDown(idx)} disabled={idx === members.length - 1}>↓</Button>
                  </div>
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-200 shrink-0 flex items-center justify-center">
                    {m.member.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.member.photoUrl} alt={m.member.fullName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs text-slate-400">{m.member.fullName.charAt(0)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-900 text-sm">{m.member.fullName}</p>
                        <p className="text-xs text-indigo-600">{m.positionName}</p>
                      </div>
                      <span className="text-xs text-slate-400">Order: {idx + 1}</span>
                    </div>
                    <Textarea
                      value={m.shortBio || ""}
                      onChange={(e) => updateBio(m.id, e.target.value)}
                      placeholder="Short bio shown on the landing page (e.g. 'A dedicated member since 2020, passionate about community finance.')"
                      rows={2}
                      className="mt-2 text-sm"
                      maxLength={500}
                    />
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2">
                <Link href="/" target="_blank" className="text-sm text-indigo-600 hover:underline inline-flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> Preview landing page
                </Link>
                <Button onClick={saveBios} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                  {saving ? "Saving…" : "Save Bios & Update Landing Page"}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
