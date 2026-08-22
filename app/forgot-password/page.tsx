"use client"

import { Suspense } from "react"
import { requestPasswordReset } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Mail, CheckCircle2, ArrowLeft, AlertTriangle } from "lucide-react"
import TrustRibbon from "@/components/somiti/TrustRibbon"
import ThemeToggle from "@/components/ThemeToggle"

function ForgotPasswordContent() {
  const searchParams = useSearchParams()
  const isSent = searchParams.get("status") === "sent"
  // Rate-limited attempts land here with `status=rate_limited&msg=...`.
  // Show the friendly retry-after message instead of the form so the user
  // knows why their reset link isn't coming.
  const isRateLimited = searchParams.get("status") === "rate_limited"
  const rateLimitMsg = searchParams.get("msg") || "Too many reset attempts, try again in an hour."

  return (
    <div className="relative flex min-h-screen flex-col bg-base">
      <TrustRibbon />
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <Link href="/login" className="mb-4 inline-flex items-center t-body text-muted-ink hover:text-primary-ink">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to Login
            </Link>
            <h1 className="t-h1 text-primary-ink">Forgot Password</h1>
          </div>

          <div className="card-premium p-6 shadow-lift">
            {isSent ? (
              <div className="py-4 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-soft">
                  <CheckCircle2 className="h-6 w-6 text-success" />
                </div>
                <h3 className="t-h3 mb-2 text-primary-ink">Check your email</h3>
                <p className="t-body text-muted-ink">
                  If an account exists for that email, we have sent a password reset link. Please check your inbox (and spam folder).
                </p>
              </div>
            ) : isRateLimited ? (
              <div className="py-4 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-debit-soft">
                  <AlertTriangle className="h-6 w-6 text-debit" />
                </div>
                <h3 className="t-h3 mb-2 text-primary-ink">Rate limited</h3>
                <p className="t-body text-muted-ink">{rateLimitMsg}</p>
                <p className="mt-2 t-caption text-faint-ink">
                  Please wait and try again later. If this keeps happening, contact your administrator.
                </p>
              </div>
            ) : (
              <form action={requestPasswordReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="t-subheading text-secondary-ink">Email Address</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint-ink" />
                    <Input id="email" name="email" type="email" required placeholder="you@example.com" className="bg-[var(--control-bg)] pl-9" />
                  </div>
                  <p className="t-caption text-muted-ink">We will send a reset link to this email.</p>
                </div>
                <Button type="submit" className="brand-gradient w-full shadow-brand-glow">
                  Send Reset Link
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-base t-body text-muted-ink">Loading...</div>}>
      <ForgotPasswordContent />
    </Suspense>
  )
}
