# 🔴 URGENT: Secret Rotation Required

The uploaded source archive contained a `.env` file with **live production secrets** committed in plaintext. This is a critical security incident. The following secrets MUST be rotated immediately — anyone who has seen the archive (or any backup of it) has the same level of access as the production system.

## Rotate These Now

| Secret | Where to Rotate | Impact if Compromised |
|---|---|---|
| `DATABASE_URL` + `DIRECT_URL` | Supabase Dashboard → Project Settings → Database → Reset database password | Full read/write access to the production database — all member data, all financial records, all credentials (passwords are bcrypt-hashed but everything else is in cleartext). |
| `ENCRYPTION_KEY` | Generate a new one with `openssl rand -base64 48` and update the env. Then run `scripts/re-encrypt-secrets.ts` to migrate stored mail/SMS secrets to the new key. | All stored mail/SMS provider credentials (Resend API key, Cloudinary secret, SMS gateway key) become undecryptable. Until rotation completes, the app cannot send mail/SMS. |
| `BALLOT_ENCRYPTION_KEY` | Generate new with `openssl rand -base64 48`. Future elections use the new key; past election ballots remain encrypted under the old key (preserve the old value somewhere accessible to election auditors). | Past election ballots cannot be re-verified. |
| `NEXTAUTH_SECRET` | Generate new with `openssl rand -base64 48`. **All active sessions are invalidated immediately** — every user must sign in again. | Anyone with a stolen JWT cookie can forge any user's session (including SUPER_ADMIN) until the secret is rotated. |
| `RESEND_API_KEY` | Resend Dashboard → API Keys → Revoke + create new. Update the env. | Attacker can send email as your domain (phishing / brand abuse) and exhaust your email quota. |
| `EMAIL_USER` + `EMAIL_PASS` | The Gmail App Password. Google Account → Security → App Passwords → Revoke + create new. | Attacker can send email as your Gmail account. |
| `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` | Cloudinary Console → Settings → Access Keys → Revoke + create new. Update the env. | Attacker can read/delete/replace every uploaded file (member photos, NID images, deposit slips, signatures) — privacy breach for every member. |
| `SMS_USER` + `SMS_KEY` | SendMySMS / BulkSMSBD Dashboard → Revoke + create new. Update the env. | Attacker can drain your SMS balance / send arbitrary SMS as your brand. |
| `CRON_SECRET` | Generate new with `openssl rand -hex 32`. Update the env. | Attacker can invoke any cron endpoint (election state transitions, loan late-fee accrual, bulk SMS sends, backups). |

## After Rotation

1. **Update `.env` on Vercel** — Settings → Environment Variables. Apply to Production, Preview, and Development environments.
2. **Redeploy** so the new values are picked up.
3. **Update `.env` locally** for any developer who has a copy.
4. **Force-rotate all admin passwords** — since the DB password was leaked, assume any admin password hash is also at risk (bcrypt + salt provides strong protection, but defense in depth).
5. **Force-logout all members** — since the JWT secret was leaked, all member sessions are already invalidated by the NEXTAUTH_SECRET rotation. Confirm.
6. **Audit recent activity** — check Vercel access logs, Cloudinary media library audit log, Supabase database audit log, Resend email log, SMS gateway log for any suspicious activity in the window between the original `.env` leak and the rotation.

## Why This Is Critical

The `.env` file in the source archive contained:
- Supabase database credentials (full DB access)
- NextAuth JWT secret (can forge any user session)
- AES-256-GCM encryption key (decrypts every mail/SMS secret stored in the DB)
- Cloudinary API secret (read/delete/replace every uploaded file)
- Resend API key (send email as your domain)
- Gmail App Password (send email as your Gmail)
- SMS gateway key (drain SMS balance / impersonate brand)
- Cron secret (invoke any cron endpoint)

Anyone with access to the original archive — including anyone who downloaded it from a backup, anyone who was shared the file, anyone with access to the machine where it was extracted — has the full set of credentials. Rotation is the only way to invalidate them.

## Going Forward

- **NEVER commit `.env` to git.** The `.gitignore` already excludes it; the file must have been added to the archive by mistake.
- **Use Vercel Environment Variables** for all production secrets — they are encrypted at rest and never appear in the source code.
- **Use a secrets manager** (1Password, Bitwarden, Doppler, AWS Secrets Manager) for sharing secrets among developers.
- **Rotate the `NEXTAUTH_SECRET` and `ENCRYPTION_KEY` periodically** — at least quarterly.
