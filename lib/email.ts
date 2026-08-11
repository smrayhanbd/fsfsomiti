import nodemailer from "nodemailer"
import { resolveMailer, testMailConnection, type EmailAttachment } from "@/lib/mail/providers"

/**
 * Backwards-compatible single entry point for transactional email.
 *
 * The public contract is unchanged for existing callers: `sendEmail(to,
 * subject, html)` is a 3-arg async function that throws on delivery failure,
 * so every existing call site (approval, auth, finance, meeting, member,
 * transactions, specialWishes) keeps working untouched.
 *
 * An optional 4th argument — `attachments?: EmailAttachment[]` — lets new
 * callers (e.g. the approval email with a money-receipt PDF) attach binary
 * files. It is threaded through the resolved provider (SMTP / Resend / Mailgun
 * / Brevo) and the legacy Gmail fallback. Omitting it behaves exactly as before.
 *
 * Internally the transport is now resolved from the active MailSettings row in
 * the DB (see lib/mail/providers.ts). When no provider is configured yet — or
 * the row is disabled / missing required secrets — we fall back to the legacy
 * env-based Gmail transporter so the app keeps sending on first deploy.
 */

export type { EmailAttachment }

// Legacy fallback transporter (Gmail via EMAIL_USER / EMAIL_PASS).
const legacyTransporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  attachments?: EmailAttachment[]
) {
  try {
    const mailer = await resolveMailer()
    if (mailer) {
      await mailer.send({ to, subject, html, attachments })
      console.log("Email sent successfully to:", to)
      return
    }
    // Fall back to legacy env-based Gmail transport.
    await legacyTransporter.sendMail({
      from: `"Future Savings Foundation" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    })
    console.log("Email sent successfully (legacy transport) to:", to)
  } catch (error) {
    console.error("Error sending email:", error)
    throw error
  }
}

/**
 * Send a test email from the settings page. Resolves to an outcome object the
 * client can render, rather than throwing, so the UI can show ✓/❌ + timing.
 */
export async function sendTestEmail(
  to: string,
  subject: string,
  html: string,
  attachments?: EmailAttachment[]
): Promise<{ ok: boolean; message: string; ms: number }> {
  const started = Date.now()
  try {
    const mailer = await resolveMailer()
    if (mailer) {
      await mailer.send({ to, subject, html, attachments })
    } else {
      await legacyTransporter.sendMail({
        from: `"Future Savings Foundation" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
        attachments: attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      })
    }
    return { ok: true, message: "Email delivered successfully.", ms: Date.now() - started }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unknown email error",
      ms: Date.now() - started,
    }
  }
}

export { testMailConnection }
