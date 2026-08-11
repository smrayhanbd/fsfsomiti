"use client"

// Per-member Trust Score dashboard (FRS §11).
//
// Shared by the admin detail page (/dashboard/trust-score/[id]) and the member
// portal page (/portal/trust-score). Renders: radial score card, KPI breakdown
// bars, 12-month trend sparkline, achievement badges grid, improvement
// suggestions, and a paginated score-history table.

import { useState } from "react"
import type { ScoreView } from "@/lib/trustScore/view"
import {
  TrendingUp,
  Lightbulb,
  Award,
  History,
  Lock,
  ArrowUp,
  ArrowDown,
  Minus,
} from "lucide-react"

export default function ScoreDashboard({
  view,
  reactivationSlot,
}: {
  view: ScoreView
  /** Optional slot for the admin-only Reactivate button. */
  reactivationSlot?: React.ReactNode
}) {
  return (
    <div className="space-y-6">
      {/* Top row: score card + KPI breakdown */}
      <div className="grid lg:grid-cols-3 gap-6">
        <RadialScoreCard view={view} reactivationSlot={reactivationSlot} />
        <KpiBreakdownPanel view={view} />
      </div>

      {/* Trend + suggestions */}
      <div className="grid lg:grid-cols-2 gap-6">
        <TrendChart view={view} />
        <SuggestionsPanel view={view} />
      </div>

      {/* Achievement badges */}
      <AchievementsPanel view={view} />

      {/* History */}
      <HistoryPanel view={view} />
    </div>
  )
}

// ─── Radial score card ──────────────────────────────────────────────────────
function RadialScoreCard({ view, reactivationSlot }: { view: ScoreView; reactivationSlot?: React.ReactNode }) {
  const score = view.member.trustScore
  const radius = 70
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color =
    score >= 80 ? "#10b981" : score >= 60 ? "#6366f1" : score >= 40 ? "#f59e0b" : "#ef4444"

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 flex flex-col items-center">
      <div className="relative w-44 h-44">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r={radius} fill="none" strokeWidth="12" className="stroke-slate-100 dark:stroke-slate-800" />
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            strokeWidth="12"
            stroke={color}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-extrabold" style={{ color }}>
            {score}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">/ 100</span>
        </div>
      </div>
      <div className="mt-4 text-center">
        <p className="text-lg font-bold text-slate-900 dark:text-white">
          {view.badgeEmoji} {view.member.badgeLevel}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">{view.member.riskLevel}</p>
        <p className="text-[11px] text-slate-400 mt-1">
          {view.member.scoreLastUpdated
            ? `Updated ${new Date(view.member.scoreLastUpdated).toLocaleDateString()}`
            : "Not yet calculated"}
        </p>
      </div>
      {view.member.status === "SUSPENDED" && (
        <div className="mt-3 w-full rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-2.5 text-center">
          <p className="text-xs font-semibold text-red-700 dark:text-red-400">
            ⛔ Account suspended — Trust Score below threshold
          </p>
        </div>
      )}
      {reactivationSlot}
    </div>
  )
}

// ─── KPI breakdown panel (FRS §11.1) ────────────────────────────────────────
function KpiBreakdownPanel({ view }: { view: ScoreView }) {
  return (
    <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
        <TrendingUp className="w-4 h-4" /> KPI Breakdown
      </h3>
      <div className="space-y-4">
        {view.breakdown.map((kpi) => {
          if (!kpi.applicable) {
            return (
              <div key={kpi.code} className="opacity-50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {kpiName(kpi.code)} <span className="text-xs text-slate-400">(N/A)</span>
                  </span>
                </div>
                <p className="text-xs text-slate-400">{kpi.detail}</p>
              </div>
            )
          }
          const pct = kpi.max > 0 ? (kpi.score / kpi.max) * 100 : 0
          const barColor = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500"
          return (
            <div key={kpi.code}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{kpiName(kpi.code)}</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {kpi.score.toFixed(1)} <span className="text-slate-400 font-normal">/ {kpi.max}</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%`, transition: "width 0.6s ease" }} />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">{kpi.detail}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Trend chart (inline SVG, no chart dependency) ──────────────────────────
function TrendChart({ view }: { view: ScoreView }) {
  const data = view.trend
  const max = 100
  const w = 320
  const h = 120
  const pad = 8
  const stepX = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0
  const points = data
    .map((d, i) => `${pad + i * stepX},${h - pad - (d.score / max) * (h - pad * 2)}`)
    .join(" ")

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
        Score Trend (12 months)
      </h3>
      {data.every((d) => d.score === 0) ? (
        <p className="text-sm text-slate-400 italic py-8 text-center">
          No score history yet. The trend will populate as the score is recalculated over time.
        </p>
      ) : (
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
          <polyline
            points={points}
            fill="none"
            stroke="#6366f1"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {data.map((d, i) => (
            <circle
              key={i}
              cx={pad + i * stepX}
              cy={h - pad - (d.score / max) * (h - pad * 2)}
              r="2.5"
              fill="#6366f1"
            />
          ))}
        </svg>
      )}
      <div className="flex justify-between mt-2 text-[10px] text-slate-400">
        {data.map((d, i) => (
          <span key={i}>{d.month.split("-")[1]}</span>
        ))}
      </div>
    </div>
  )
}

// ─── Suggestions panel (FRS §13) ────────────────────────────────────────────
function SuggestionsPanel({ view }: { view: ScoreView }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
        <Lightbulb className="w-4 h-4" /> Improvement Suggestions
      </h3>
      {view.suggestions.length === 0 ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400 py-6 text-center font-medium">
          🎉 You&apos;re at the top of your game — no improvements needed right now!
        </p>
      ) : (
        <div className="space-y-2.5">
          {view.suggestions.map((s, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800"
            >
              <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 flex items-center justify-center text-xs font-bold shrink-0">
                +{s.potentialGain > 0 ? s.potentialGain.toFixed(0) : "·"}
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300">{s.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Achievement badges grid (FRS §10, §11.1) ───────────────────────────────
function AchievementsPanel({ view }: { view: ScoreView }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
        <Award className="w-4 h-4" /> Achievement Badges
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {view.achievements.map((a) => (
          <div
            key={a.code}
            title={`${a.name}${a.earnedDate ? ` · earned ${new Date(a.earnedDate).toLocaleDateString()}` : ""}`}
            className={`relative flex flex-col items-center text-center p-3 rounded-xl border transition-all ${
              a.earned
                ? "border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20"
                : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 opacity-60"
            }`}
          >
            <span className={`text-2xl mb-1 ${a.earned ? "" : "grayscale"}`}>{a.emoji}</span>
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 leading-tight">
              {a.name}
            </span>
            {!a.earned && (
              <Lock className="absolute top-1.5 right-1.5 w-3 h-3 text-slate-400" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Score history table (FRS §11.1, §15) ───────────────────────────────────
function HistoryPanel({ view }: { view: ScoreView }) {
  const [page, setPage] = useState(1)
  const perPage = 20
  const totalPages = Math.max(1, Math.ceil(view.history.length / perPage))
  const slice = view.history.slice((page - 1) * perPage, page * perPage)

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden">
      <div className="p-6 pb-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
          <History className="w-4 h-4" /> Score History
        </h3>
      </div>
      {view.history.length === 0 ? (
        <p className="text-sm text-slate-400 italic py-8 text-center">No score changes recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="text-left font-bold px-4 py-2">Date</th>
                <th className="text-left font-bold px-3 py-2">Event</th>
                <th className="text-left font-bold px-3 py-2">KPI</th>
                <th className="text-center font-bold px-3 py-2">Change</th>
                <th className="text-center font-bold px-3 py-2">New Score</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((h) => (
                <tr key={h.id} className="border-b border-slate-100 dark:border-slate-800/50 last:border-0">
                  <td className="px-4 py-2.5 text-slate-500 text-xs">
                    {new Date(h.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300 font-mono text-xs">
                    {h.eventType}
                  </td>
                  <td className="px-3 py-2.5">
                    {h.kpiAffected && h.kpiAffected !== "NONE" && h.kpiAffected !== "ALL" ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {h.kpiAffected}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <ChangeBadge change={h.scoreChange} />
                  </td>
                  <td className="px-3 py-2.5 text-center font-bold text-slate-900 dark:text-white">{h.scoreAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
            <span>
              {(page - 1) * perPage + 1}–{Math.min(page * perPage, view.history.length)} of {view.history.length}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ChangeBadge({ change }: { change: number }) {
  if (change === 0)
    return (
      <span className="inline-flex items-center text-slate-400 text-xs font-semibold">
        <Minus className="w-3 h-3" /> 0
      </span>
    )
  const positive = change > 0
  return (
    <span
      className={`inline-flex items-center text-xs font-bold ${
        positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
      }`}
    >
      {positive ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {positive ? "+" : ""}
      {change}
    </span>
  )
}

function kpiName(code: string): string {
  const map: Record<string, string> = {
    DEPOSIT: "Deposit Discipline",
    LOAN: "Loan Repayment",
    ATTEND: "Meeting Attendance",
    FINE: "Fine History",
    REFERRAL: "Referral",
  }
  return map[code] || code
}
