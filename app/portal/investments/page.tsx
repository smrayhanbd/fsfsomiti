import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getTransparencySettings } from "@/app/actions/portal"
import PortalInvestmentsClient from "./PortalInvestmentsClient"

export const dynamic = "force-dynamic"

/**
 * Member portal → Investments (read-only list).
 *
 * Reuses the dashboard's query shape but selects only public fields (no
 * internal CoA account IDs, no `createdById`/audit actor info). Gated by the
 * admin's `showInvestments` toggle (Transparency Settings).
 */
export default async function PortalInvestmentsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") redirect("/")

  const transparency = await getTransparencySettings()
  if (!transparency.showInvestments) redirect("/portal")

  const investments = await prisma.investment.findMany({
    where: { isDeleted: false },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      investmentNo: true,
      name: true,
      subCategory: true,
      investedAmount: true,
      costBasis: true,
      currentValue: true,
      investmentDate: true,
      maturityDate: true,
      status: true,
      investmentType: { select: { id: true, name: true, slug: true } },
    },
  })

  const rows = investments.map((i) => {
    const invested = Number(i.costBasis)
    const current = Number(i.currentValue || i.costBasis)
    const gainLoss = current - invested
    const roi = invested > 0 ? (gainLoss / invested) * 100 : 0
    return {
      id: i.id,
      investmentNo: i.investmentNo,
      name: i.name,
      subCategory: i.subCategory,
      costBasis: invested,
      currentValue: current,
      gainLoss,
      roi,
      investmentDate: i.investmentDate.toISOString(),
      maturityDate: i.maturityDate?.toISOString() ?? null,
      status: i.status,
      type: { id: i.investmentType.id, name: i.investmentType.name, slug: i.investmentType.slug },
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Investments
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Where the somiti&apos;s funds are invested. Read-only.
          </p>
        </div>
        <Link
          href="/portal"
          className="inline-flex items-center text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          ← Back to Dashboard
        </Link>
      </div>

      <PortalInvestmentsClient rows={rows} />
    </div>
  )
}
