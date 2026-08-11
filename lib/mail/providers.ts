import nodemailer, { type Transporter } from "nodemailer"
import { Resend } from "resend"
import prisma from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { type MailProvider } from "@/lib/mail/provider-metadata"

/**
 * Mail transport resolution.
 *
 * Reads the active {@link MailSettings} singleton, decrypts the stored secret,
 * and builds the appropriate transport for the configured provider. SMTP-style
 * providers (gmail, custom_smtp, m365, ses) share a nodemailer transporter;
 * API-only providers (resend, mailgun, brevo) go through their HTTP API.
 *
 * The public surface used by `lib/email.ts` is:
 *   - {@link resolveMailer} → returns a Mailer bound to the current config
 *   - {@link testMailConnection} → verify-only, used by the settings page
 *
 * This module is server-only — it imports nodemailer, resend, and prisma. The
 * client-safe {@link MailProvider} type and MAIL_PROVIDERS catalogue live in
 * lib/mail/provider-metadata.ts so client components don't bundle Node deps.
 */

export interface Mailer {
  /** Display "From" header, e.g. `Future Savings <noreply@example.com>`. */
  from: string
  replyTo?: string
  /** Send a single message. Throws on delivery failure. */
  send(args: {
    to: string
    subject: string
    html: string
    attachments?: EmailAttachment[]
  }): Promise<void>
  /** Verify the transport credentials/config without sending. Throws on failure. */
  verify(): Promise<void>
}

/** Portable attachment description, provider-agnostic. */
export interface EmailAttachment {
  filename: string
  content: Buffer
  contentType?: string
}

type MailSettingsRow = NonNullable<Awaited<ReturnType<typeof prisma.mailSettings.findUnique>>>

/** Build the `from` header from saved display name + from email. */
function buildFrom(s: MailSettingsRow): string {
  const email = s.fromEmail?.trim() || process.env.EMAIL_USER || ""
  const name = s.displayName?.trim() || "Future Savings Foundation"
  return email ? `"${name}" <${email}>` : name
}

// ── SMTP-style providers ─────────────────────────────────────────────────────

function smtpOptionsForProvider(s: MailSettingsRow): nodemailer.TransportOptions | false {
  const enc = (s.encryption || "tls").toLowerCase()
  const port = s.smtpPort ?? 587
  const password = s.smtpPasswordEnc ? decrypt(s.smtpPasswordEnc) : ""
  // Apply the admin-set connection timeout (stored in seconds) to every SMTP
  // phase so a blocked/unreachable server fails fast instead of hanging the
  // request indefinitely. Nodemailer takes these in milliseconds.
  const timeoutMs = Math.max(5, s.timeoutSec ?? 30) * 1000
  const timeouts = {
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
  }

  // Provider-specific SMTP host/defaults when not overridden by the admin.
  let host = s.smtpHost || ""
  switch (s.provider as MailProvider) {
    case "gmail":
      host = host || "smtp.gmail.com"
      return {
        service: "gmail",
        auth: { user: s.smtpUsername || "", pass: password },
        ...timeouts,
      } as nodemailer.TransportOptions
    case "m365":
      host = host || "smtp.office365.com"
      break
    case "ses":
      host = host || `email-smtp.${s.sesRegion || "us-east-1"}.amazonaws.com`
      break
    case "custom_smtp":
      if (!host) return false
      break
  }

  return {
    host,
    port,
    secure: enc === "ssl" || (enc === "tls" && port === 465),
    requireTLS: enc === "tls",
    auth: { user: s.smtpUsername || "", pass: password },
    ...timeouts,
  } as nodemailer.TransportOptions
}

function makeSmtpMailer(s: MailSettingsRow): Mailer | null {
  const options = smtpOptionsForProvider(s)
  if (!options) return null
  const transporter: Transporter = nodemailer.createTransport(options)
  const from = buildFrom(s)
  return {
    from,
    replyTo: s.replyTo || undefined,
    async send({ to, subject, html, attachments }) {
      await transporter.sendMail({
        from,
        to,
        subject,
        html,
        replyTo: s.replyTo || undefined,
        attachments: attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      })
    },
    async verify() {
      await transporter.verify()
    },
  }
}

// ── API-only providers ───────────────────────────────────────────────────────

function makeResendMailer(s: MailSettingsRow): Mailer | null {
  if (!s.apiKeyEnc) return null
  const apiKey = decrypt(s.apiKeyEnc)
  const client = new Resend(apiKey)
  const from = buildFrom(s)
  return {
    from,
    replyTo: s.replyTo || undefined,
    async send({ to, subject, html, attachments }) {
      const { error } = await client.emails.send({
        from,
        to,
        subject,
        html,
        replyTo: s.replyTo || undefined,
        attachments: attachments?.map((a) => ({
          filename: a.filename,
          content: a.content.toString("base64"),
          ...(a.contentType ? { content_type: a.contentType } : {}),
        })),
      })
      if (error) throw new Error(`Resend: ${error.name} — ${error.message}`)
    },
    async verify() {
      // Resend has no verify endpoint; a malformed key surfaces on first send,
      // so we just confirm the client can be constructed and the key is non-empty.
      if (!apiKey) throw new Error("Resend API key is empty.")
    },
  }
}

function makeMailgunMailer(s: MailSettingsRow): Mailer | null {
  if (!s.apiKeyEnc || !s.apiDomain) return null
  const apiKey = decrypt(s.apiKeyEnc)
  const domain = s.apiDomain
  const region = (s.apiRegion || "US").toUpperCase()
  const base = region === "EU" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net"
  const from = buildFrom(s)
  return {
    from,
    replyTo: s.replyTo || undefined,
    async send({ to, subject, html, attachments }) {
      // Without attachments we keep the simple URL-encoded body; with binary
      // attachments we switch to multipart/form-data.
      const form = new FormData()
      form.append("from", from)
      form.append("to", to)
      form.append("subject", subject)
      form.append("html", html)
      if (s.replyTo) form.append("h:Reply-To", s.replyTo)
      if (attachments?.length) {
        attachments.forEach((a) => {
          // Copy into a fresh ArrayBuffer-backed Uint8Array. TS's BlobPart
          // type requires an ArrayBuffer (not ArrayBufferLike), and Node's
          // Buffer can sit over a SharedArrayBuffer — copying sidesteps both
          // the type mismatch and any shared-memory surprise.
          const copy = new Uint8Array(a.content.byteLength)
          copy.set(a.content)
          form.append(
            "attachment",
            new Blob([copy], { type: a.contentType || "application/octet-stream" }),
            a.filename
          )
        })
      }
      const res = await fetch(`${base}/v3/${domain}/messages`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`api:${apiKey}`).toString("base64"),
        },
        body: form,
      })
      if (!res.ok) throw new Error(`Mailgun: ${res.status} ${await res.text()}`)
    },
    async verify() {
      // Cheap authenticated GET against the domain endpoint to check the key.
      const res = await fetch(`${base}/v3/${domain}`, {
        headers: { Authorization: "Basic " + Buffer.from(`api:${apiKey}`).toString("base64") },
      })
      if (res.status === 401) throw new Error("Mailgun: invalid API key or domain.")
    },
  }
}

function makeBrevoMailer(s: MailSettingsRow): Mailer | null {
  if (!s.apiKeyEnc) return null
  const apiKey = decrypt(s.apiKeyEnc)
  const from = buildFrom(s)
  return {
    from,
    replyTo: s.replyTo || undefined,
    async send({ to, subject, html, attachments }) {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: { name: s.displayName || "Future Savings Foundation", email: s.fromEmail || "" },
          to: [{ email: to }],
          subject,
          htmlContent: html,
          ...(s.replyTo ? { replyTo: { email: s.replyTo } } : {}),
          ...(attachments?.length
            ? {
                attachment: attachments.map((a) => ({
                  name: a.filename,
                  content: a.content.toString("base64"),
                })),
              }
            : {}),
        }),
      })
      if (!res.ok) throw new Error(`Brevo: ${res.status} ${await res.text()}`)
    },
    async verify() {
      const res = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": apiKey },
      })
      if (res.status === 401 || res.status === 403) throw new Error("Brevo: invalid API key.")
    },
  }
}

/**
 * Resolve a mailer for the active provider, or `null` when no usable config
 * exists (missing row, provider disabled, required secret blank). Returning
 * null lets `sendEmail` fall back to the legacy env-based Gmail transport.
 */
export async function resolveMailer(): Promise<Mailer | null> {
  const s = await prisma.mailSettings.findUnique({ where: { id: "singleton" } })
  if (!s || !s.isActive) return null

  switch (s.provider as MailProvider) {
    case "resend":
      return makeResendMailer(s)
    case "mailgun":
      return makeMailgunMailer(s)
    case "brevo":
      return makeBrevoMailer(s)
    case "gmail":
    case "m365":
    case "ses":
    case "custom_smtp":
    default:
      return makeSmtpMailer(s)
  }
}

/** Verify the currently-configured mail transport. Throws on failure. */
export async function testMailConnection(): Promise<void> {
  const mailer = await resolveMailer()
  if (!mailer) throw new Error("No active mail provider configured.")
  await mailer.verify()
}

// Client-safe metadata re-exported for convenience (server-side importers).
export { MAIL_PROVIDERS } from "@/lib/mail/provider-metadata"
