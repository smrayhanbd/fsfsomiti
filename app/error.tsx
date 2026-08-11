"use client"

/**
 * Route-segment error boundary.
 *
 * Catches errors thrown by Server Components in this segment (anything below
 * `app/`). When an error reaches here, Next.js replaces the segment's UI with
 * this component and passes the error + a `reset()` callback that re-renders
 * the segment from scratch (the "Try again" button).
 *
 * Branded to match the rest of the app — uses the same Card/Button primitives
 * and Tailwind theme tokens so a 500 doesn't look like a different product.
 *
 * NOTE: this file must be a Client Component ("use client") because it relies
 * on React state for the details toggle and on the `error` prop shape.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronRight } from "lucide-react"

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [showDetails, setShowDetails] = useState(false)

  // Surface the error in the browser console for developer ergonomics; the
  // dedicated logger (lib/logger.ts) handles the server side.
  useEffect(() => {
    console.error("[RouteErrorBoundary]", error)
  }, [error])

  const isDev = process.env.NODE_ENV !== "production"

  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-base p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-debit-soft text-debit">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <CardTitle className="text-primary-ink">Something went wrong</CardTitle>
          <CardDescription>
            An unexpected error occurred while rendering this page. Your data is safe.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={reset} className="brand-gradient h-11 flex-1">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try again
            </Button>
            <Link href="/dashboard" className="flex-1">
              <Button variant="outline" className="h-11 w-full">
                <Home className="mr-2 h-4 w-4" />
                Home
              </Button>
            </Link>
          </div>

          {isDev && (
            <div className="rounded-lg border border-base bg-surface p-3">
              <button
                type="button"
                onClick={() => setShowDetails((s) => !s)}
                className="flex w-full items-center gap-2 text-left t-subheading text-secondary-ink hover:text-primary-ink"
              >
                {showDetails ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Error details (dev only)
              </button>
              {showDetails && (
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded bg-base p-3 t-caption text-debit">
                  {error?.message || String(error)}
                  {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
                  {error?.stack ? `\n\n${error.stack}` : ""}
                </pre>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
