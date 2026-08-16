import LoanProductForm from "../LoanProductForm"
import { createLoanProduct } from "@/app/actions/loan"
import { guardDashboardPage } from "@/lib/page-guard"

export const dynamic = 'force-dynamic'

export default async function NewLoanProductPage() {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("Finance & Accounting", "Loan Management")


  return <LoanProductForm action={createLoanProduct} />
}
