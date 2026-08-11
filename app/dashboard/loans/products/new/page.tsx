import LoanProductForm from "../LoanProductForm"
import { createLoanProduct } from "@/app/actions/loan"

export const dynamic = 'force-dynamic'

export default function NewLoanProductPage() {
  return <LoanProductForm action={createLoanProduct} />
}
