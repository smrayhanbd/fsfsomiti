"use client"

/**
 * /login/mfa — MFA challenge page (step 2 of 2-factor login).
 *
 * Flow:
 *   1. User submits email + password on /login.
 *   2. Credentials provider validates password; if MFA is enabled, returns
 *      role="MFA_PENDING". LoginClient detects this and redirects here with
 *      ?userId=...
 *   3. This page collects the 6-digit TOTP code (or 8-char backup code) and
 *      calls signIn("credentials-mfa", { userId, mfaToken }) to complete login.
 *   4. On success, NextAuth issues a real session and we redirect to /dashboard.
 */
import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, ShieldCheck, KeyRound } from "lucide-react"

export default function MfaLoginPage() {
  const router = useRouter()
  const params = useSearchParams()
  const userId = params.get("userId") || ""
  const [token, setToken] = useState("")
  const [useBackupCode, setUseBackupCode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!userId) {
      setError("Missing user ID — please return to the login page and try again.")
      return
    }
    if (!useBackupCode && !/^\d{6}$/.test(token)) {
      setError("Enter the 6-digit code from your authenticator app.")
      return
    }
    if (useBackupCode && token.length < 8) {
      setError("Enter an 8-character backup code.")
      return
    }
    setLoading(true)
    setError("")

    // Step 2: call the credentials-mfa provider with userId + TOTP/backup.
    const res = await signIn("credentials-mfa", {
      userId,
      mfaToken: token,
      redirect: false,
    })

    if (res?.error) {
      setError("Invalid code. Try again or use a backup code.")
      setLoading(false)
    } else if (res?.ok) {
      // MFA verified — redirect to the dashboard.
      router.push("/dashboard")
      router.refresh()
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <CardTitle className="text-primary-ink">Two-factor authentication</CardTitle>
          <CardDescription>
            {useBackupCode
              ? "Enter one of your 8-character backup codes."
              : "Enter the 6-digit code from your authenticator app to continue."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div role="alert" className="rounded-lg border border-debit bg-debit-soft p-3 t-body text-debit">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="token" className="t-subheading text-secondary-ink">
                {useBackupCode ? "Backup code" : "Authentication code"}
              </Label>
              <Input
                id="token"
                name="token"
                type="text"
                inputMode={useBackupCode ? "text" : "numeric"}
                autoComplete={useBackupCode ? "off" : "one-time-code"}
                pattern={useBackupCode ? "[A-Z0-9]+" : "\\d{6}"}
                maxLength={useBackupCode ? 8 : 6}
                value={token}
                onChange={(e) =>
                  setToken(
                    useBackupCode
                      ? e.target.value.toUpperCase().slice(0, 8)
                      : e.target.value.replace(/\D/g, "").slice(0, 6)
                  )
                }
                required
                autoFocus
                className="h-11 rounded-xl bg-[var(--control-bg)] text-center text-2xl tracking-[0.3em]"
                placeholder={useBackupCode ? "XXXXXXXX" : "000000"}
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="brand-gradient h-11 w-full rounded-xl font-semibold shadow-brand-glow disabled:opacity-60"
            >
              <KeyRound className="mr-2 h-4 w-4" />
              {loading ? "Verifying…" : "Verify"}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setUseBackupCode((v) => !v)
                setToken("")
                setError("")
              }}
              className="t-caption text-faint-ink hover:text-secondary-ink"
            >
              {useBackupCode ? "Use authenticator code instead" : "Use a backup code instead"}
            </button>
          </div>

          <div className="mt-6 text-center">
            <Link href="/login" className="t-caption text-faint-ink hover:text-secondary-ink inline-flex items-center gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
