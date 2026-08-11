"use client"

// Trust Score leaderboard (FRS §11, §17 GET /api/members/leaderboard).
//
// System-wide ranking with summary stat cards (avg score, tier distribution,
// suspended count), search, and per-row links to the detail dashboard.

import { useState, useMemo } from "react"
import Link from "next/link"
import { Trophy, Award, TrendingUp, AlertTriangle, Search, ShieldCheck, type LucideIcon } from "lucide-react"

import StatCard from "@/components/somiti/StatCard"
import StatusBadge from "@/components/somiti/StatusBadge"
import SectionCard from "@/components/somiti/SectionCard"

interface LeaderMember {
  id: string
  fullName: string
  memberNo: string
  photoUrl: string | null
  status: string
  trustScore: number
  badgeLevel: string
  riskLevel: string
  scoreLastUpdated: string | null
}

export default function TrustLeaderboardClient({ members }: { members: LeaderMember[] }) {
  const [search, setSearch] = useState("")
  const [tierFilter, setTierFilter] = useState<string>("all")

  const filtered = useMemo(() => {
    let r = [...members].sort((a, b) => b.trustScore - a.trustScore)
    if (search) {
      const q = search.toLowerCase()
      r = r.filter((m) => m.fullName.toLowerCase().includes(q) || m.memberNo.toLowerCase().includes(q))
    }
    if (tierFilter !== "all") r = r.filter((m) => badgeTier(m.trustScore) === tierFilter)
    return r
  }, [members, search, tierFilter])

  const avg = members.length ? Math.round(members.reduce((s, m) => s + m.trustScore, 0) / members.length) : 0
  const suspended = members.filter((m) => m.status === "SUSPENDED").length
  const diamond = members.filter((m) => m.trustScore >= 90).length

  return (
    <div className="space-y-8">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Average Score" value={avg.toLocaleString()} icon={Trophy as LucideIcon} accent="blue" />
        <StatCard label="Diamond Members" value={diamond.toLocaleString()} icon={Award as LucideIcon} accent="violet" />
        <StatCard label="Total Scored" value={members.length.toLocaleString()} icon={TrendingUp as LucideIcon} accent="emerald" />
        <StatCard label="Suspended" value={suspended.toLocaleString()} icon={AlertTriangle as LucideIcon} accent="crimson" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint-ink" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members by name or ID..."
            className="w-full rounded-xl border border-[var(--border-base)] bg-[var(--control-bg)] py-2.5 pl-9 pr-4 t-body text-primary-ink placeholder:text-muted-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklch,var(--brand-primary)_25%,transparent)]"
          />
        </div>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="cursor-pointer rounded-xl border border-[var(--border-base)] bg-surface px-3 py-2.5 t-body text-secondary-ink focus:border-brand focus:outline-none"
        >
          <option value="all">All Tiers</option>
          <option value="diamond">💎 Diamond (90+)</option>
          <option value="platinum">🏆 Platinum (80–89)</option>
          <option value="gold">🥇 Gold (70–79)</option>
          <option value="silver">🥈 Silver (60–69)</option>
          <option value="warning">⚠️ Needs Improvement (50–59)</option>
          <option value="highrisk">🚨 High Risk (40–49)</option>
          <option value="suspended">❌ Suspended (&lt;40)</option>
        </select>
      </div>

      {/* Leaderboard */}
      <SectionCard title="Member Ranking" icon={<Trophy />} accent="gold" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-base)] bg-subtle/40">
                <th className="t-overline w-12 px-4 py-3.5 text-left text-muted-ink">#</th>
                <th className="t-overline px-4 py-3.5 text-left text-muted-ink">Member</th>
                <th className="t-overline px-4 py-3.5 text-center text-muted-ink">Score</th>
                <th className="t-overline px-4 py-3.5 text-left text-muted-ink">Badge</th>
                <th className="t-overline px-4 py-3.5 text-left text-muted-ink">Risk</th>
                <th className="t-overline px-4 py-3.5 text-center text-muted-ink">Status</th>
                <th className="t-overline px-4 py-3.5 text-right text-muted-ink"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr className="border-b border-[var(--border-base)]">
                  <td colSpan={7} className="t-body py-12 text-center text-muted-ink">
                    No members match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((m, i) => (
                  <tr key={m.id} className="border-b border-[var(--border-base)] transition-colors last:border-0 hover:bg-subtle">
                    <td className="px-4 py-3">
                      <RankBadge rank={i} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {m.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.photoUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-[var(--border-base)]" />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient-soft t-subheading font-bold text-brand">
                            {m.fullName.charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="t-subheading text-primary-ink">{m.fullName}</p>
                          <p className="t-num t-caption text-muted-ink">{m.memberNo}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="t-display t-num font-extrabold" style={{ color: scoreVar(m.trustScore) }}>{m.trustScore}</span>
                    </td>
                    <td className="t-body px-4 py-3 text-secondary-ink">
                      {emojiForBadge(m.badgeLevel)} {m.badgeLevel}
                    </td>
                    <td className="px-4 py-3">
                      <RiskBadge risk={m.riskLevel} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/trust-score/${m.id}`}
                        className="t-caption inline-flex items-center gap-1 font-semibold text-brand hover:underline"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" /> View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}

/** Top-3 medal styling; others get a neutral numeric chip. */
function RankBadge({ rank }: { rank: number }) {
  const styles: Record<number, { bg: string; fg: string }> = {
    0: { bg: "color-mix(in oklch, var(--status-warning) 20%, transparent)", fg: "var(--status-warning)" }, // gold #1
    1: { bg: "var(--bg-subtle)", fg: "var(--text-secondary)" }, // silver #2
    2: { bg: "color-mix(in oklch, var(--status-info) 20%, transparent)", fg: "var(--status-info)" }, // bronze #3
  }
  const s = styles[rank]
  if (!s) return <span className="t-num t-caption text-faint-ink">{rank + 1}</span>
  return (
    <span
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {rank + 1}
    </span>
  )
}

function badgeTier(score: number): string {
  if (score >= 90) return "diamond"
  if (score >= 80) return "platinum"
  if (score >= 70) return "gold"
  if (score >= 60) return "silver"
  if (score >= 50) return "warning"
  if (score >= 40) return "highrisk"
  return "suspended"
}

function emojiForBadge(label: string): string {
  if (label.includes("Diamond")) return "💎"
  if (label.includes("Platinum")) return "🏆"
  if (label.includes("Gold")) return "🥇"
  if (label.includes("Silver")) return "🥈"
  if (label.includes("Improvement")) return "⚠️"
  if (label.includes("High Risk")) return "🚨"
  return "❌"
}

/** Map a trust score to a semantic token colour. */
function scoreVar(score: number): string {
  if (score >= 80) return "var(--status-success-fg)"
  if (score >= 60) return "var(--brand-primary)"
  if (score >= 40) return "var(--status-warning-fg)"
  return "var(--status-debit-fg)"
}

type RiskTone = "success" | "info" | "warning" | "debit"
function RiskBadge({ risk }: { risk: string }) {
  const map: Record<string, RiskTone> = {
    "Low Risk": "success",
    "Average": "info",
    "Elevated Risk": "warning",
    "High Risk": "debit",
  }
  const tone = map[risk] ?? "info"
  const tones: Record<RiskTone, string> = {
    success: "bg-success-soft text-success border-success",
    info: "bg-info-soft text-info border-info",
    warning: "bg-warning-soft text-warning border-warning",
    debit: "bg-debit-soft text-debit border-debit",
  }
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 t-caption font-semibold ${tones[tone]}`}>
      {risk}
    </span>
  )
}
