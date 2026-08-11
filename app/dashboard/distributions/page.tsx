import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Plus, PieChart } from "lucide-react"
import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"
import { formatBDT } from "@/components/somiti/Money"
import { SOURCE_TYPE_LABELS, STATUS_LABELS } from "@/lib/distribution/types"

export const dynamic = "force-dynamic"

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-amber-100 text-amber-800",
  POSTED: "bg-emerald-100 text-emerald-800",
  REVERSED: "bg-rose-100 text-rose-800",
}

export default async function DistributionsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")

  const distributions = await prisma.incomeDistribution.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      investment: { select: { investmentNo: true, name: true } },
      project: { select: { projectNo: true, name: true } },
      _count: { select: { shares: true } },
    },
  })

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Income Distributions"
        subtitle="Profit & income split among members by fund share"
        actions={
          <Link href="/dashboard/distributions/new">
            <Button className="brand-gradient shadow-brand-glow">
              <Plus className="mr-2 h-4 w-4" /> New Distribution
            </Button>
          </Link>
        }
      />

      <SectionCard title="All Distributions" icon={<PieChart />} accent="blue" bodyClassName="p-0">
        {distributions.length === 0 ? (
          <div className="p-8 text-center">
            <p className="t-body text-secondary-ink">No distributions yet.</p>
            <p className="mt-1 t-caption text-muted-ink">
              Distribute investment income, project profit, or bank interest to members based on their fund share.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-base)] bg-subtle/60">
                  <th className="t-overhead px-4 py-3 text-left text-muted-ink">No.</th>
                  <th className="t-overhead px-4 py-3 text-left text-muted-ink">Title</th>
                  <th className="t-overhead px-4 py-3 text-left text-muted-ink">Source</th>
                  <th className="t-overhead px-4 py-3 text-right text-muted-ink">Amount</th>
                  <th className="t-overhead px-4 py-3 text-center text-muted-ink">Members</th>
                  <th className="t-overhead px-4 py-3 text-left text-muted-ink">Snapshot</th>
                  <th className="t-overhead px-4 py-3 text-center text-muted-ink">Status</th>
                </tr>
              </thead>
              <tbody>
                {distributions.map((d) => (
                  <tr key={d.id} className="border-b border-[var(--border-base)] hover:bg-subtle/40">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/distributions/${d.id}`} className="font-medium text-brand hover:underline">
                        {d.distributionNo}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-secondary-ink">
                      {d.title}
                      {d.investment && (
                        <span className="ml-2 t-caption text-muted-ink">{d.investment.investmentNo}</span>
                      )}
                      {d.project && (
                        <span className="ml-2 t-caption text-muted-ink">{d.project.projectNo}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-secondary-ink">{SOURCE_TYPE_LABELS[d.sourceType]}</td>
                    <td className="px-4 py-3 text-right t-num font-semibold">
                      {formatBDT(Number(d.totalDistributable))}
                    </td>
                    <td className="px-4 py-3 text-center text-secondary-ink">{d._count.shares}</td>
                    <td className="px-4 py-3 text-secondary-ink">
                      {new Date(d.snapshotDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[d.status]}`}>
                        {STATUS_LABELS[d.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
