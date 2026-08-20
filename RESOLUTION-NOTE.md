# Resolution Note — `[next-auth][error][CLIENT_FETCH_ERROR]`

## Symptom

```
[next-auth][error][CLIENT_FETCH_ERROR]
  "https://next-auth.js.org/errors#client_fetch_error"
  "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"

Next.js version: 16.3.0 (Turbopack)
```

The browser's `next-auth/react` client tries to `fetch('/api/auth/session')`,
receives HTML instead of JSON, and crashes inside `JSON.parse`.

## Root cause

The NextAuth route handler itself (`app/api/auth/[...nextauth]/route.ts`)
was already correct — it returns JSON `{}` with `Content-Type: application/json`
when curled directly. So the error was **NOT** in NextAuth.

The real culprit was a **stale shell-level `DATABASE_URL` env var** that
overrode the project's `.env` value:

| Source                               | `DATABASE_URL`                                                  |
|--------------------------------------|-----------------------------------------------------------------|
| Container `/start.sh` shell env      | `file:/home/z/my-project/db/custom.db` (SQLite, wrong)         |
| Project `.env`                       | `postgresql://...supabase.com:6543/postgres` (correct)          |
| Winner (Next.js auto-load semantics) | **shell env** — `.env` does NOT override existing process env  |

Because Prisma's `schema.prisma` declares `provider = "postgresql"`, the
SQLite URL fails Prisma's datasource validation:

```
Error validating datasource `db`:
  the URL must start with the protocol `postgresql://` or `postgres://`.
```

Every Server Component that touched Prisma (`app/page.tsx`,
`app/dashboard/...`, etc.) threw a 500 → Next.js rendered the HTML
`app/error.tsx` boundary → the `SessionProvider` (in the root layout)
fired `useSession()` from inside that broken render tree → the resulting
fetch surface in the browser looked exactly like the
`CLIENT_FETCH_ERROR` quoted above.

## The fix

`lib/prisma.ts` now explicitly reloads `.env` with `override: true` in
non-production environments, BEFORE the first `PrismaClient` is constructed:

```ts
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config({ override: true })
  } catch {
    // dotenv is a devDependency; fall through if missing.
  }
}
```

This makes the project's own `.env` authoritative in dev — even when the
shell has a stale `DATABASE_URL`. In production (Vercel, Docker, etc.)
the platform's env vars still win, which is the desired behaviour there.

## Verification

Tested end-to-end with `agent-browser`:

| Scenario                                | `/api/auth/session` | `/` (homepage)        | Console                |
|-----------------------------------------|---------------------|-----------------------|------------------------|
| `DATABASE_URL=postgresql://...` (correct)| 200 JSON            | 200 HTML (117 KB)     | clean, no errors       |
| `DATABASE_URL=file:...` (broken, pre-fix)| 200 JSON           | 500 HTML (error page)| `CLIENT_FETCH_ERROR`   |
| `DATABASE_URL=file:...` (broken, **with fix**) | 200 JSON      | **200 HTML (118 KB)** | **clean, no errors**   |

## What to do if you still see the error

1. **Stop the dev server**, then restart it: `Ctrl+C`, then `npm run dev`.
   The override runs at module-load time, so an already-running process
   won't pick up the new code until it restarts.
2. **Confirm `DATABASE_URL` in `.env`** is the Postgres URL from Supabase
   (port 6543, transaction pooler). It must start with `postgresql://`.
3. **Confirm `NEXTAUTH_URL`** matches the origin your browser uses
   (`http://localhost:3000` for local dev, your Vercel URL in production).
4. **Confirm `NEXTAUTH_SECRET`** is set (any 32+ char random string;
   `openssl rand -base64 48`).
5. If deploying on Vercel: make sure `DATABASE_URL`, `DIRECT_URL`,
   `NEXTAUTH_SECRET`, and (for preview/prod) `NEXTAUTH_URL` are set in
   the Vercel project's Environment Variables — Vercel does not read
   `.env` for production runtime.

## Files touched

- `lib/prisma.ts` — added the `.env` override loader at the top (one
  small guarded block, ~10 lines). No other logic changes.

---

# Fix 2 — `Foreign key constraint violated on the constraint: AuditLog_targetUserId_fkey`

## Symptom

Clicking **"Reset & Send Credentials"** on a member in the admin dashboard
fails with the misleading toast "Could not send credentials", and the
server log shows:

```
Invalid `prisma.auditLog.create()` invocation in
  .../[root-of-the-server]__1168sv-._.js:2346:141

await prisma.auditLog.create(

Foreign key constraint violated on the constraint: `AuditLog_targetUserId_fkey`
```

## Root cause

In `app/actions/member.ts`, the `resetMemberCredentials()` server action
calls `writeRbacAudit({ targetUserId: member.id, ... })`. But:

- `member` came from `prisma.member.findUnique(...)` — so `member.id` is the
  primary key of the **`Member`** table.
- `AuditLog.targetUserId` has a foreign key to the **`User`** table
  (see `prisma/schema.prisma`, relation `AuditTargetUser`).
- Members and RBAC Users (admins) are separate entities — a Member row
  never exists in `User`, so `member.id` is not a valid `User.id`.

Postgres therefore rejects the insert with the FK violation shown above,
the server action throws, the surrounding `try/catch` swallows it, and the
user sees "Could not send credentials" — even though the email/SMS were
already sent (they ran before the audit call).

## The fix

`app/actions/member.ts` (around line 938): drop `targetUserId: member.id`
and put the member reference inside `details` instead. The schema's
`targetUserId` and `targetRoleId` columns are both nullable, so leaving
them null for member-targeted actions is the correct shape.

```ts
await writeRbacAudit({
  actorId: user.id,
  // targetUserId intentionally omitted — member.id is NOT a User.id,
  // and AuditLog.targetUserId has a FK to User.id.
  action: "MEMBER_CREDENTIALS_RESET",
  details: { memberId: member.id, memberNo: member.memberNo, channels },
})
```

The audit trail is **not** weakened — `memberId` lives inside the JSON
`details` column, so you can still query "who reset credentials for
member X" by filtering on `details->>'memberId'`.

## Verification

Reproduced directly against the production Supabase DB:

| Scenario                                            | Result                                  |
|-----------------------------------------------------|-----------------------------------------|
| `targetUserId: <member.id>` (the bug)               | **FAIL** — FK violation                 |
| omit `targetUserId`, put `memberId` in `details`     | **OK** — audit row created successfully |

## Files touched

- `app/actions/member.ts` — `resetMemberCredentials()`: dropped the
  `targetUserId` argument and moved `memberId` into `details`. The
  inline comment block above the call explains why. No schema migration
  required — `targetUserId` is already nullable.

## Should you also audit other places?

`grep -rn "targetUserId:.*member" --include="*.ts"` finds only the one
site fixed here. All other `writeRbacAudit` callers pass a real
`User.id` (admin targets), so they're unaffected.

If you later add more member-targeted audit actions (e.g. member status
changes, member deletion), follow the same pattern: omit `targetUserId`
and stash `memberId` inside `details`.
