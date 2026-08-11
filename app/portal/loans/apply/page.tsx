import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import LoanApplyForm, { type ProductOption } from "./LoanApplyForm"
import { ArrowLeft, FilePlus2 } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function ApplyLoanPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") redirect("/")

  const memberId = session.user.id

  // Confirm the member is eligible (ACTIVE) and load available products in parallel.
  const [member, products] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, status: true, fullName: true },
    }),
    prisma.loanProduct.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
  ])

  if (!member) redirect("/")

  const productOptions: ProductOption[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    minAmount: Number(p.minAmount),
    maxAmount: Number(p.maxAmount),
    interestRate: Number(p.interestRate),
    interestType: p.interestType,
    repaymentFreq: p.repaymentFreq,
    numberOfInstallments: p.numberOfInstallments,
    gracePeriod: p.gracePeriod,
    processingFee: Number(p.processingFee),
  }))

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/loans" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors mb-3">
          <ArrowLeft className="h-4 w-4" /> Back to My Loans
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <FilePlus2 className="h-7 w-7 text-indigo-500" /> Apply for a Loan
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Choose a product, set your terms, and review the repayment preview before submitting.
        </p>
      </div>

      {member.status !== "ACTIVE" ? (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-6 text-center">
          <p className="font-semibold text-amber-800 dark:text-amber-200">Loan applications are only available to active members.</p>
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
            Your current status is <span className="font-semibold">{member.status}</span>. Please contact management.
          </p>
          <Link href="/portal">
            <Button variant="outline" className="mt-4">Back to Dashboard</Button>
          </Link>
        </div>
      ) : (
        <LoanApplyForm memberId={member.id} products={productOptions} />
      )}
    </div>
  )
}
