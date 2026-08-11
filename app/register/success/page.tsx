import Link from "next/link"
import { CheckCircle } from "lucide-react"
import TrustRibbon from "@/components/somiti/TrustRibbon"

export default function RegisterSuccessPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-base">
      <TrustRibbon />
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="card-premium w-full max-w-md p-8 text-center shadow-lift">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-success-soft">
            <CheckCircle className="h-8 w-8 text-success" />
          </div>
          <h1 className="t-h1 mb-2 text-primary-ink">Application Submitted!</h1>
          <p className="t-body mb-8 text-muted-ink">
            Thank you for registering. Your application is now pending approval by our management team.
            Once approved, you will receive an email with your portal login credentials.
          </p>
          <Link href="/" className="brand-gradient inline-flex items-center justify-center rounded-lg px-6 py-2.5 t-body font-medium text-white shadow-brand-glow">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  )
}
