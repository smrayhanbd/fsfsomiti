"use client"

import { Suspense } from "react"
import { resetPassword } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Lock, ArrowLeft } from "lucide-react"
import TrustRibbon from "@/components/somiti/TrustRibbon"
import ThemeToggle from "@/components/ThemeToggle"
import LanguageToggle from "@/components/somiti/LanguageToggle"

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  if (!token) {
    return (
      <div className="relative flex min-h-screen flex-col bg-base">
        <TrustRibbon />
        <div className="flex flex-1 items-center justify-center px-4 py-12">
          <div className="card-premium w-full max-w-md p-6 text-center shadow-lift">
            <h3 className="t-h3 mb-2 text-debit">Invalid Link</h3>
            <p className="t-body mb-4 text-muted-ink">The password reset link is missing a token. Please request a new link.</p>
            <Link href="/forgot-password"><Button variant="outline">Request New Link</Button></Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-base">
      <TrustRibbon />
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        <LanguageToggle compact />
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <Link href="/login" className="mb-4 inline-flex items-center t-body text-muted-ink hover:text-primary-ink">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to Login
            </Link>
            <h1 className="t-h1 text-primary-ink">Reset Password</h1>
          </div>

          <div className="card-premium p-6 shadow-lift">
            <p className="t-body mb-4 text-muted-ink">Enter your new password below.</p>
            <form action={resetPassword} className="space-y-4">
              <input type="hidden" name="token" value={token} />

              <div className="space-y-2">
                <Label htmlFor="password" className="t-subheading text-secondary-ink">New Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint-ink" />
                  <Input id="password" name="password" type="password" required placeholder="Minimum 6 characters" className="bg-[var(--control-bg)] pl-9" minLength={6} />
                </div>
              </div>
              <Button type="submit" className="brand-gradient w-full shadow-brand-glow">
                Update Password
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-base t-body text-muted-ink">Loading...</div>}>
      <ResetPasswordContent />
    </Suspense>
  )
}
