import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Home, Compass } from "lucide-react"

/**
 * Branded 404 page.
 *
 * Next.js renders this whenever no route matches. We also expose a manual
 * `notFound()` from `next/navigation` — every Server Component that looks up
 * an entity by id and finds nothing should call it, and the user will land
 * here. Marked `force-dynamic` to match the rest of the app (the root layout
 * reads from the DB and must not be statically prerendered at build time).
 */
export const dynamic = "force-dynamic"

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-base p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
            <Compass className="h-6 w-6" />
          </div>
          <CardTitle className="text-primary-ink">Page not found</CardTitle>
          <CardDescription>
            The page you’re looking for doesn’t exist, may have been moved, or
            you don’t have permission to view it.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="mb-4 text-center">
            <span className="t-display text-brand-gradient">404</span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/dashboard" className="flex-1">
              <Button className="brand-gradient h-11 w-full">
                <Home className="mr-2 h-4 w-4" />
                Go to Dashboard
              </Button>
            </Link>
            <Link href="/" className="flex-1">
              <Button variant="outline" className="h-11 w-full">
                Home
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
