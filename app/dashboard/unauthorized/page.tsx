import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ShieldX, ArrowLeft } from "lucide-react"

export const dynamic = "force-dynamic"

// Shown when a user lands on a dashboard page they don't have permission for.
// Reached via server-side redirect from guarded pages (and the sidebar hides
// disallowed nav items, so this is mostly a direct-URL backstop).
export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-debit-soft">
        <ShieldX className="h-10 w-10 text-debit" />
      </div>
      <h1 className="t-h1 text-primary-ink">Access Denied</h1>
      <p className="mt-2 max-w-md t-body text-muted-ink">
        You don&apos;t have permission to view this page. If you believe this is a mistake,
        ask an administrator to grant your role access to this section.
      </p>
      <div className="mt-6">
        <Link href="/dashboard">
          <Button className="brand-gradient shadow-brand-glow">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  )
}
