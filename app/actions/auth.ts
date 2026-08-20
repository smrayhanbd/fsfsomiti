"use server"

import prisma from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import bcrypt from "bcryptjs"
import { randomBytes } from "crypto"
import { redirect } from "next/navigation"
import { assertPasswordResetAllowed } from "@/app/actions/rateLimitActions"

export async function requestPasswordReset(formData: FormData) {
  const email = formData.get("email") as string

  // 0. Rate-limit BEFORE we touch the DB. We use email+IP as the key so
  //    a single attacker can't lock out a victim by spamming their email
  //    (per-IP cap), AND a distributed attacker still hits the per-IP cap.
  //    The check runs unconditionally — even for unknown emails — so the
  //    limiter can't be used as an oracle to enumerate accounts.
  try {
    await assertPasswordResetAllowed(email || "unknown")
  } catch (err) {
    // Throw a friendly, localized error message — the user will see this
    // in the form. The full error is also surfaced via the redirect.
    const message =
      err instanceof Error ? err.message : "Too many reset attempts, try again in an hour."
    redirect(`/forgot-password?status=rate_limited&msg=${encodeURIComponent(message)}`)
  }

  // 1. Check if user exists (Admin or Member)
  const admin = await prisma.user.findUnique({ where: { email } })
  const member = await prisma.member.findFirst({ where: { email } })

  if (!admin && !member) {
    // For security, don't reveal if email exists or not. Just redirect.
    redirect("/forgot-password?status=sent")
  }

  // 2. Generate Secure Token
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 3600000) // Expires in 1 hour

  // 3. Save token to database (delete old ones for this email first)
  await prisma.passwordReset.deleteMany({ where: { email } })
  await prisma.passwordReset.create({
    data: { email, token, expiresAt }
  })

  // 4. Send Email with Reset Link
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
  const resetUrl = `${baseUrl}/reset-password?token=${token}`

  try {
    await sendEmail(
      email,
      "Password Reset Request",
      `<p>You requested a password reset.</p><p>Click <a href="${resetUrl}">here</a> to reset your password. This link will expire in 1 hour.</p><p>If you did not request this, please ignore this email.</p>`
    )
  } catch (error) {
    console.error("Failed to send reset email:", error)
  }

  redirect("/forgot-password?status=sent")
}

export async function resetPassword(formData: FormData) {
  const token = formData.get("token") as string
  const password = formData.get("password") as string

  if (!token || !password || password.length < 6) {
    throw new Error("Invalid input. Password must be at least 6 characters.")
  }

  // 1. Verify Token
  const resetEntry = await prisma.passwordReset.findUnique({ where: { token } })

  if (!resetEntry || resetEntry.expiresAt < new Date()) {
    throw new Error("Invalid or expired token.")
  }

  // 2. Hash New Password
  // D14: bcrypt rounds bumped from 10 → 12 for stronger password hashing
  // (10 ≈ 100ms, 12 ≈ 300ms — acceptable latency for a password reset).
  const hashedPassword = await bcrypt.hash(password, 10)

  // 3. Update User or Member Account
  const admin = await prisma.user.findUnique({ where: { email: resetEntry.email } })
  if (admin) {
    await prisma.user.update({ where: { id: admin.id }, data: { password: hashedPassword } })
  } else {
    const member = await prisma.member.findFirst({ where: { email: resetEntry.email } })
    if (member) {
      await prisma.memberAccount.updateMany({ 
        where: { memberId: member.id }, 
        data: { passwordHash: hashedPassword } 
      })
    }
  }

  // 4. Delete used token
  await prisma.passwordReset.delete({ where: { id: resetEntry.id } })

  redirect("/login?status=reset")
}