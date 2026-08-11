// ATTEND KPI calculator (FRS §5.4).
//
// Measures meeting participation. Applicable to all members. If no meetings
// have been held yet the KPI defaults to full weight (FRS §5.4 / §20). Excused
// absences may count as attended when configured.

import type { KpiConfig } from "../config"
import type { MemberContext } from "../context"
import type { KpiBreakdown } from "../types"

export function calculateAttendKpi(
  ctx: MemberContext,
  config: KpiConfig,
  weight: number
): KpiBreakdown & { totalMeetingsHeld: number } {
  const total = ctx.totalMeetingsHeld

  // No meetings declared yet → full weight (FRS §5.4 + §20).
  if (!total || total === 0) {
    return {
      code: "ATTEND",
      applicable: true,
      defaultWeight: config.attendanceWeight,
      redistributedWeight: weight,
      score: weight,
      max: weight,
      detail: "No meetings held yet — defaults to full score.",
      totalMeetingsHeld: 0,
    }
  }

  // Attendance rows: PRESENT always counts; EXCUSED counts only if configured.
  const counted = ctx.attendance.filter(
    (a) => a.status === "PRESENT" || (a.status === "EXCUSED" && config.approvedAbsenceCounts)
  ).length
  const rate = Math.min(1, counted / total)

  let score: number
  if (rate >= 1) score = weight
  else if (rate >= 0.9) score = (18 / 20) * weight
  else if (rate >= 0.8) score = (16 / 20) * weight
  else if (rate >= 0.7) score = (14 / 20) * weight
  else if (rate >= 0.6) score = (12 / 20) * weight
  else score = rate * weight // proportional below 60% (FRS §5.4)

  score = Math.max(0, round2(score))

  return {
    code: "ATTEND",
    applicable: true,
    defaultWeight: config.attendanceWeight,
    redistributedWeight: weight,
    score,
    max: weight,
    detail: `${counted}/${total} meetings attended (${pct(rate)}).`,
    totalMeetingsHeld: total,
  }
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
