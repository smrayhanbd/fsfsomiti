import prisma from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import InvestmentDetailClient from "./InvestmentDetailClient"

export const dynamic = "force-dynamic"

export default async function InvestmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  const { id } = await params

  const investment = await prisma.investment.findUnique({
    where: { id },
    include: {
      investmentType: { select: { id: true, name: true, slug: true } },
      incomes: { orderBy: { incomeDate: "desc" } },
      exits: { orderBy: { exitDate: "desc" } },
      valuations: { orderBy: { valuationDate: "desc" } },
      projectLinks: { include: { project: { select: { id: true, name: true, projectNo: true, status: true } } } },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 50 },
      debitAccount: { select: { id: true, accountName: true, accountCode: true } },
      journalEntry: {
        select: { id: true, voucherNo: true, voucherType: true, entryDate: true, narration: true, totalDebit: true, totalCredit: true, lines: { include: { account: { select: { accountName: true } } } } },
      },
    },
  })
  if (!investment) notFound()

  // All projects for the linking picker.
  const allProjects = await prisma.project.findMany({
    where: { isDeleted: false },
    orderBy: { createdAt: "desc" },
    select: { id: true, projectNo: true, name: true },
  })

  // All journal vouchers linked to this investment (purchase + income + exit + valuation).
  const linkedEntryIds = [
    investment.journalEntryId,
    ...investment.incomes.map((i) => i.journalEntryId),
    ...investment.exits.map((e) => e.journalEntryId),
    ...investment.valuations.map((v) => v.journalEntryId),
  ].filter(Boolean) as string[]

  const vouchers = linkedEntryIds.length > 0
    ? await prisma.journalEntry.findMany({
        where: { id: { in: linkedEntryIds } },
        orderBy: { entryDate: "desc" },
        select: { id: true, voucherNo: true, voucherType: true, entryDate: true, narration: true, totalDebit: true, totalCredit: true },
      })
    : []

  const invested = Number(investment.costBasis)
  const current = Number(investment.currentValue || investment.costBasis)
  const totalIncome = investment.incomes.reduce((s, i) => s + Number(i.netAmount), 0)

  return (
    <InvestmentDetailClient
      investment={{
        id: investment.id,
        investmentNo: investment.investmentNo,
        name: investment.name,
        subCategory: investment.subCategory,
        description: investment.description,
        investmentDate: investment.investmentDate.toISOString(),
        maturityDate: investment.maturityDate?.toISOString() ?? null,
        tags: investment.tags as unknown as string[],
        investedAmount: Number(investment.investedAmount),
        currency: investment.currency,
        exchangeRate: Number(investment.exchangeRate),
        bdtEquivalent: Number(investment.bdtEquivalent),
        feesAmount: Number(investment.feesAmount),
        costBasis: invested,
        currentValue: current,
        gainLoss: current - invested,
        roi: invested > 0 ? ((current - invested) / invested) * 100 : 0,
        expectedAnnualReturn: Number(investment.expectedAnnualReturn),
        incomeTypes: investment.incomeTypes as unknown as string[],
        paymentFrequency: investment.paymentFrequency,
        status: investment.status,
        paymentMethod: investment.paymentMethod,
        referenceNo: investment.referenceNo,
        details: (investment.details ?? {}) as Record<string, unknown>,
        documents: (investment.documents ?? []) as Array<{ name: string; type?: string; url: string; date?: string; notes?: string }>,
        type: { id: investment.investmentType.id, name: investment.investmentType.name, slug: investment.investmentType.slug },
        assetAccount: { id: investment.debitAccount.id, accountName: investment.debitAccount.accountName, accountCode: investment.debitAccount.accountCode },
      }}
      incomes={investment.incomes.map((i) => ({
        id: i.id, incomeDate: i.incomeDate.toISOString(), incomeType: i.incomeType,
        grossAmount: Number(i.grossAmount), tdsAmount: Number(i.tdsAmount), netAmount: Number(i.netAmount),
        referenceNo: i.referenceNo, voucherNo: i.journalEntryId, notes: i.notes,
      }))}
      exits={investment.exits.map((e) => ({
        id: e.id, exitDate: e.exitDate.toISOString(), exitType: e.exitType,
        proceeds: Number(e.proceeds), costBasisSold: Number(e.costBasisSold),
        capitalGainLoss: Number(e.capitalGainLoss), netProceeds: Number(e.netProceeds),
        taxAmount: Number(e.taxAmount), notes: e.notes,
      }))}
      valuations={investment.valuations.map((v) => ({
        id: v.id, valuationDate: v.valuationDate.toISOString(), marketValue: Number(v.marketValue),
        method: v.method, valuer: v.valuer, changeAmount: v.changeAmount ? Number(v.changeAmount) : null,
      }))}
      projects={investment.projectLinks.map((l) => ({
        linkId: l.id, relationshipType: l.relationshipType, relationshipNote: l.relationshipNote,
        id: l.project.id, name: l.project.name, projectNo: l.project.projectNo, status: l.project.status,
      }))}
      vouchers={vouchers.map((v) => ({
        id: v.id, voucherNo: v.voucherNo, voucherType: v.voucherType,
        entryDate: v.entryDate.toISOString(), narration: v.narration,
        totalDebit: Number(v.totalDebit), totalCredit: Number(v.totalCredit),
      }))}
      purchaseVoucher={investment.journalEntry ? {
        voucherNo: investment.journalEntry.voucherNo,
        voucherType: investment.journalEntry.voucherType,
        lines: investment.journalEntry.lines.map((l) => ({
          accountName: l.account.accountName, debit: Number(l.debit), credit: Number(l.credit), memo: l.memo,
        })),
      } : null}
      auditLogs={investment.auditLogs.map((a) => ({
        id: a.id, action: a.action, summary: a.summary,
        actorName: a.actorName, createdAt: a.createdAt.toISOString(),
      }))}
      allProjects={allProjects.map((p) => ({ id: p.id, projectNo: p.projectNo, name: p.name }))}
      totalIncome={totalIncome}
    />
  )
}
