/**
 * Client-safe mail provider catalogue.
 *
 * Split from `lib/mail/providers.ts` so client components (the settings form)
 * can import the picker metadata WITHOUT dragging nodemailer / resend / prisma
 * into the browser bundle. The transport logic in providers.ts stays
 * server-only; only constants and types live here.
 */

export type MailProvider =
  | "gmail"
  | "custom_smtp"
  | "ses"
  | "resend"
  | "mailgun"
  | "brevo"
  | "m365"

export const MAIL_PROVIDERS: { value: MailProvider; label: string; description: string; type: "smtp" | "api" }[] = [
  { value: "gmail", label: "Gmail", description: "Google Mail via SMTP (App Password).", type: "smtp" },
  { value: "custom_smtp", label: "Custom SMTP", description: "Any SMTP server you control.", type: "smtp" },
  { value: "ses", label: "Amazon SES", description: "AWS Simple Email Service (SMTP interface).", type: "smtp" },
  { value: "resend", label: "Resend", description: "Developer-friendly email API.", type: "api" },
  { value: "mailgun", label: "Mailgun", description: "Transactional email API (US/EU).", type: "api" },
  { value: "brevo", label: "Brevo", description: "Brevo (formerly Sendinblue) API.", type: "api" },
  { value: "m365", label: "Microsoft 365", description: "Office 365 SMTP relay.", type: "smtp" },
]
