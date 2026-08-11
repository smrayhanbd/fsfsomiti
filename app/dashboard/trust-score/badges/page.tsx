import prisma from "@/lib/prisma"
import Link from "next/link"
import { ArrowLeft, Medal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export const dynamic = "force-dynamic"

// The 7 achievement badge definitions (FRS §10.1) — kept here for display only.
// The live evaluation logic lives in lib/trustScore/badges.ts.
const BADGE_DEFS = [
  { code: "DIAMOND_SAVER", name: "Diamond Saver", emoji: "💎", criteria: "12 consecutive on-time deposits" },
  { code: "PERFECT_PAYER", name: "Perfect Payer", emoji: "⏰", criteria: "24 consecutive months with no late deposits" },
  { code: "MEETING_STAR", name: "Meeting Star", emoji: "⭐", criteria: "100% attendance in a rolling 12-month window" },
  { code: "ZERO_FINE", name: "Zero Fine", emoji: "🎯", criteria: "No fines issued in the last 12 months" },
  { code: "REFERRAL_CHAMPION", name: "Referral Champion", emoji: "🤝", criteria: "5 or more active referrals" },
  { code: "LOAN_HERO", name: "Loan Hero", emoji: "🥇", criteria: "All loan installments paid on time" },
  { code: "LOYAL_MEMBER", name: "Loyal Member", emoji: "🌱", criteria: "10+ years of continuous membership (permanent)" },
]

export default async function BadgesRosterPage() {
  // Count active holders per badge code.
  const holders = await prisma.achievementBadge.groupBy({
    by: ["badgeCode"],
    where: { status: "ACTIVE" },
    _count: { memberId: true },
  })
  const countMap = new Map(
    holders.map((h: { badgeCode: string; _count: { memberId: number } }) => [
      h.badgeCode,
      h._count.memberId,
    ]) as Array<[string, number]>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Achievement Badges
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Independent of the Trust Score tier. Members can hold several at once.
          </p>
        </div>
        <Link href="/dashboard/trust-score">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Leaderboard
          </Button>
        </Link>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {BADGE_DEFS.map((b) => {
          const count = countMap.get(b.code) ?? 0
          return (
            <Card key={b.code} className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center text-2xl">
                    {b.emoji}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-900 dark:text-white">{b.name}</h3>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full">
                        <Medal className="w-3 h-3" /> {count}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{b.criteria}</p>
                    <p className="text-[11px] font-mono text-slate-400 mt-2">{b.code}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
