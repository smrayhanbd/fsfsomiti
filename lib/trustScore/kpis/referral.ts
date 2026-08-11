// REFERRAL KPI calculator (FRS §5.6).
//
// Encourages membership growth. Applicable to all members. Only active,
// approved referrals count: a referred member must be in good standing (ACTIVE
// or PENDING — i.e. not suspended/inactive/closed/rejected). The score steps
// up by active-referral-count; if a referred member becomes inactive the score
// drops automatically at recalc time (FRS §5.6).

import type { KpiConfig } from "../config"
import type { MemberContext } from "../context"
import type { KpiBreakdown } from "../types"

/** Good-standing statuses: a referral only counts while the referred member is these. */
const GOOD_STANDING = new Set(["ACTIVE", "PENDING"])

export function calculateReferralKpi(
  ctx: MemberContext,
  config: KpiConfig,
  weight: number
): KpiBreakdown {
  const active = ctx.referrals.filter((r) => GOOD_STANDING.has(r.status)).length

  // FRS §5.6 step table, scaled to the current (redistributed) weight.
  const baseWeight = config.referralWeight
  let frac: number
  if (active >= 5) frac = 1.0
  else if (active === 4) frac = 0.8
  else if (active === 3) frac = 0.6
  else if (active === 2) frac = 0.4
  else if (active === 1) frac = 0.2
  else frac = 0

  const score = round2(frac * weight)

  return {
    code: "REFERRAL",
    applicable: true,
    defaultWeight: baseWeight,
    redistributedWeight: weight,
    score,
    max: weight,
    detail: `${active} active referral(s) in good standing.`,
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
