import prisma from "@/lib/prisma"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  HandCoins, PlusCircle, PackagePlus, FileSignature, Wallet,
  TrendingUp, AlertTriangle, Clock, ArrowRight,
} from "lucide-react"
import LoanProductManager, { type ProductRow } from "./products/LoanProductManager"
import ApplicationsTable, { type ApplicationRow } from "./ApplicationsTable"

import PageHeader from "@/components/somiti/PageHeader"
import StatCard from "@/components/somiti/StatCard"
import Money from "@/components/somiti/Money"
import StatusBadge from "@/components/somiti/StatusBadge"
import SectionCard from "@/components/somiti/SectionCard"

export const dynamic = 'force-dynamic'

export default async function LoansHubPage() {
  const [loans, applications, products] = await Promise.all([
    prisma.loan.findMany({
      where: { status: { in: ["DISBURSED", "REPAID", "DEFAULTED", "CLOSED", "WRITTEN_OFF"] } },
      include: { member: true, product: true },
      orderBy: { disbursedDate: "desc" },
    }),
    prisma.loan.findMany({
      where: { status: { in: ["PENDING", "APPROVED"] } },
      include: { member: true, product: true },
      orderBy: { applicationDate: "desc" },
    }),
    prisma.loanProduct.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { loans: true } } },
    }),
  ])

  // KPIs
  const totalDisbursed = loans
    .filter((l) => ["DISBURSED", "REPAID", "DEFAULTED"].includes(l.status))
    .reduce((sum, l) => sum + Number(l.principal), 0)
  const totalOutstanding = loans
    .filter((l) => ["DISBURSED", "DEFAULTED"].includes(l.status))
    .reduce((sum, l) => sum + Number(l.outstandingBalance), 0)
  const totalCollectedInterest = loans.reduce((sum, l) => sum + Number(l.interestPaid), 0)
  const overdueCount = loans.filter((l) => l.status === "DISBURSED" && l.nextDueDate && new Date(l.nextDueDate) < new Date()).length
  const pendingCount = applications.filter((a) => a.status === "PENDING").length

  const serializedProducts: ProductRow[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    interestRate: Number(p.interestRate),
    interestType: p.interestType,
    repaymentFreq: p.repaymentFreq,
    numberOfInstallments: p.numberOfInstallments,
    minAmount: Number(p.minAmount),
    maxAmount: Number(p.maxAmount),
    isActive: p.isActive,
    _count: { loans: p._count.loans },
  }))

  const serializedApps: ApplicationRow[] = applications.map((a) => ({
    id: a.id,
    loanNo: a.loanNo,
    status: a.status,
    memberName: a.member.fullName,
    memberNo: a.member.memberNo,
    memberPhone: a.member.phone,
    memberId: a.member.id,
    productName: a.product.name,
    principal: Number(a.principal),
    totalPayable: Number(a.totalPayable),
    applicationDate: a.applicationDate.toISOString(),
  }))

  return (
    <div className="space-y-8">
      <PageHeader
        title="Loan Management"
        subtitle="Manage loan products, applications, disbursements and repayments."
        actions={
          <>
            <Link href="/dashboard/loans/products/new">
              <Button variant="outline" className="rounded-xl">
                <PackagePlus className="mr-2 h-4 w-4" /> New Product
              </Button>
            </Link>
            <Link href="/dashboard/loans/apply">
              <Button className="brand-gradient shadow-brand-glow rounded-xl">
                <PlusCircle className="mr-2 h-4 w-4" /> New Loan
              </Button>
            </Link>
          </>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Disbursed" value={<Money amount={totalDisbursed} />} icon={Wallet} accent="blue" />
        <StatCard label="Outstanding" value={<Money amount={totalOutstanding} />} icon={AlertTriangle} accent="amber" />
        <StatCard label="Interest Collected" value={<Money amount={totalCollectedInterest} />} icon={TrendingUp} accent="emerald" trend={{ value: 6, positive: true }} />
        <StatCard label="Overdue Loans" value={overdueCount.toLocaleString()} icon={Clock} accent="crimson" />
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="active">Active Loans ({loans.length})</TabsTrigger>
          <TabsTrigger value="applications">
            Applications
            {pendingCount > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--status-warning)] px-1 text-[10px] font-bold text-[var(--brand-gold-foreground)]">{pendingCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
        </TabsList>

        {/* Active Loans */}
        <TabsContent value="active" className="mt-4">
          <SectionCard>
            {loans.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-gradient-soft">
                  <HandCoins className="h-8 w-8 text-brand" />
                </div>
                <h3 className="t-h3 text-primary-ink">No active loans</h3>
                <p className="t-body mt-1 max-w-sm text-muted-ink">Disburse a loan to see it tracked here with live repayment progress.</p>
                <Link href="/dashboard/loans/apply" className="mt-4">
                  <Button size="sm" className="brand-gradient shadow-brand-glow"><FileSignature className="mr-2 h-4 w-4" /> Create Loan</Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[var(--border-base)] hover:bg-transparent">
                      <TableHead className="t-overline px-4 py-3.5 text-muted-ink">Loan / Member</TableHead>
                      <TableHead className="t-overline px-4 py-3.5 text-muted-ink">Product</TableHead>
                      <TableHead className="t-overline px-4 py-3.5 text-right text-muted-ink">Principal</TableHead>
                      <TableHead className="t-overline px-4 py-3.5 text-right text-muted-ink">Outstanding</TableHead>
                      <TableHead className="t-overline px-4 py-3.5 text-muted-ink">Next Due</TableHead>
                      <TableHead className="t-overline px-4 py-3.5 text-center text-muted-ink">Status</TableHead>
                      <TableHead className="t-overline px-4 py-3.5 text-right text-muted-ink">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loans.map((l) => {
                      const progress = Number(l.totalPayable) > 0
                        ? Math.min(100, Math.round(((Number(l.principalPaid) + Number(l.interestPaid) + Number(l.finePaid)) / Number(l.totalPayable)) * 100))
                        : 0
                      const overdue = l.status === "DISBURSED" && l.nextDueDate && new Date(l.nextDueDate) < new Date()
                      return (
                        <TableRow key={l.id} className="border-[var(--border-base)] transition-colors last:border-0 hover:bg-subtle">
                          <TableCell className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient-soft t-subheading font-bold text-brand">
                                {l.member.fullName.charAt(0)}
                              </div>
                              <div>
                                <Link href={`/dashboard/loans/${l.id}`} className="t-subheading text-primary-ink hover:underline">{l.member.fullName}</Link>
                                <p className="t-num t-caption text-muted-ink">{l.loanNo} · {l.member.memberNo}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="t-body px-4 py-3 text-secondary-ink">{l.product.name}</TableCell>
                          <TableCell className="px-4 py-3 text-right"><Money amount={Number(l.principal)} className="t-subheading text-primary-ink" /></TableCell>
                          <TableCell className="px-4 py-3 text-right">
                            <Money amount={Number(l.outstandingBalance)} className="t-subheading font-bold text-warning" />
                            <div className="ml-auto mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-inset">
                              <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: "var(--status-success)" }} />
                            </div>
                          </TableCell>
                          <TableCell className="t-body px-4 py-3">
                            {l.nextDueDate ? (
                              <span className={overdue ? "font-semibold text-debit" : "text-muted-ink"}>
                                {new Date(l.nextDueDate).toLocaleDateString()}
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-center">
                            <StatusBadge status={l.status} />
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right">
                            <Link href={`/dashboard/loans/${l.id}`}>
                              <Button variant="ghost" size="sm" className="text-brand hover:bg-brand-gradient-soft">
                                View <ArrowRight className="ml-1 h-3 w-3" />
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* Applications */}
        <TabsContent value="applications" className="mt-4">
          <SectionCard>
            <ApplicationsTable applications={serializedApps} />
          </SectionCard>
        </TabsContent>

        {/* Products */}
        <TabsContent value="products" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Link href="/dashboard/loans/products/new">
              <Button size="sm" className="brand-gradient shadow-brand-glow"><PackagePlus className="mr-2 h-4 w-4" /> New Product</Button>
            </Link>
          </div>
          <LoanProductManager products={serializedProducts} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
