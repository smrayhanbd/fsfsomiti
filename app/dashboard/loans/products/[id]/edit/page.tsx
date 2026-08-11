import prisma from "@/lib/prisma"
import { notFound } from "next/navigation"
import LoanProductForm, { type LoanProductData } from "../../LoanProductForm"
import { updateLoanProduct } from "@/app/actions/loan"

export const dynamic = 'force-dynamic'

export default async function EditLoanProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const product = await prisma.loanProduct.findUnique({ where: { id } })
  if (!product) notFound()

  const data: LoanProductData = {
    id: product.id,
    name: product.name,
    code: product.code,
    description: product.description,
    minAmount: Number(product.minAmount),
    maxAmount: Number(product.maxAmount),
    interestRate: Number(product.interestRate),
    interestType: product.interestType,
    repaymentFreq: product.repaymentFreq,
    numberOfInstallments: product.numberOfInstallments,
    gracePeriod: product.gracePeriod,
    lateFinePerDay: product.lateFinePerDay ? Number(product.lateFinePerDay) : null,
    processingFee: Number(product.processingFee),
    allowEarlySettlement: product.allowEarlySettlement,
    allowInterestWaiver: product.allowInterestWaiver,
    allowReschedule: product.allowReschedule,
    allowManualSchedule: product.allowManualSchedule,
    isActive: product.isActive,
  }

  // Bind the product id into the server action.
  const action = updateLoanProduct.bind(null, id)

  return <LoanProductForm product={data} action={action} />
}
