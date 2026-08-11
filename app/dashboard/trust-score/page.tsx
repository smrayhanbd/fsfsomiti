import prisma from "@/lib/prisma"
import TrustLeaderboardClient from "./TrustLeaderboardClient"
import Link from "next/link"
import { Settings, Medal } from "lucide-react"
import PageHeader from "@/components/somiti/PageHeader"

export const dynamic = "force-dynamic"

export default async function TrustLeaderboardPage() {
  const members = await prisma.member.findMany({
    where: { status: { in: ["ACTIVE", "SUSPENDED", "INACTIVE"] } },
    select: {
      id: true,
      fullName: true,
      memberNo: true,
      photoUrl: true,
      status: true,
      trustScore: true,
      badgeLevel: true,
      riskLevel: true,
      scoreLastUpdated: true,
    },
    orderBy: { trustScore: "desc" },
  })

  const serialized = members.map((m) => ({
    ...m,
    scoreLastUpdated: m.scoreLastUpdated?.toISOString() ?? null,
  }))

  return (
    <div className="space-y-8">
      <PageHeader
     
        title="Trust Score Leaderboard"
        subtitle="Member performance ranking by Trust Score. Scores update automatically from savings, loans, attendance, fines, and referrals."
        actions={
          <>
            <Link
              href="/dashboard/trust-score/badges"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-base)] bg-surface px-4 py-2.5 t-body font-medium text-secondary-ink transition-colors hover:bg-subtle hover:text-primary-ink"
            >
              <Medal className="h-4 w-4" /> Badges
            </Link>
            <Link
              href="/dashboard/trust-score/config"
              className="brand-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2.5 t-body font-medium text-white shadow-brand-glow"
            >
              <Settings className="h-4 w-4" /> Score Settings
            </Link>
          </>
        }
      />

      <TrustLeaderboardClient members={serialized} />
    </div>
  )
}
