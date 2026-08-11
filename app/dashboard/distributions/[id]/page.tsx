import prisma from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import DistributionDetailClient from "./DistributionDetailClient"

export const dynamic = "force-dynamic"

export default async function DistributionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  const { id } = await params

  const distribution = await prisma.incomeDistribution.findUnique({
    where: { id },
    include: {
      shares: { orderBy: { amount: "desc" } },
      investment: { select: { id: true, investmentNo: true, name: true } },
      project: { select: { id: true, projectNo: true, name: true } },
      journalEntry: {
        include: {
          lines: { include: { account: { select: { accountName: true, accountCode: true } } } },
        },
      },
      reversalJournal: { select: { voucherNo: true, entryDate: true, narration: true } },
    },
  })

  if (!distribution) notFound()

  // Serialize Decimals → numbers for the client component.
  const data = {
    id: distribution.id,
    distributionNo: distribution.distributionNo,
    sourceType: distribution.sourceType,
    basis: distribution.basis,
    status: distribution.status,
    title: distribution.title,
    description: distribution.description,
    snapshotDate: distribution.snapshotDate.toISOString(),
    totalDistributable: Number(distribution.totalDistributable),
    eligibleFund: Number(distribution.eligibleFund),
    memberCount: distribution.memberCount,
    postedAt: distribution.postedAt?.toISOString() ?? null,
    postedByName: distribution.postedByName,
    reversalReason: distribution.reversalReason,
    reversedAt: distribution.reversedAt?.toISOString() ?? null,
    investment: distribution.investment
      ? { id: distribution.investment.id, investmentNo: distribution.investment.investmentNo, name: distribution.investment.name }
      : null,
    project: distribution.project
      ? { id: distribution.project.id, projectNo: distribution.project.projectNo, name: distribution.project.name }
      : null,
    shares: distribution.shares.map((s) => ({
      id: s.id,
      memberNo: s.memberNo,
      memberName: s.memberName,
      fundAtSnapshot: Number(s.fundAtSnapshot),
      weight: Number(s.weight),
      amount: Number(s.amount),
    })),
    journalEntry: distribution.journalEntry
      ? {
          voucherNo: distribution.journalEntry.voucherNo,
          entryDate: distribution.journalEntry.entryDate.toISOString(),
          narration: distribution.journalEntry.narration,
          lines: distribution.journalEntry.lines.map((l) => ({
            accountName: l.account.accountName,
            accountCode: l.account.accountCode,
            debit: Number(l.debit),
            credit: Number(l.credit),
            memo: l.memo,
          })),
        }
      : null,
    reversalJournal: distribution.reversalJournal
      ? {
          voucherNo: distribution.reversalJournal.voucherNo,
          entryDate: distribution.reversalJournal.entryDate.toISOString(),
          narration: distribution.reversalJournal.narration,
        }
      : null,
  }

  return <DistributionDetailClient distribution={data} />
}
