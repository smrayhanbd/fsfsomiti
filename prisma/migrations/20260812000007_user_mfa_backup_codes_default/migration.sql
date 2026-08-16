-- ─────────────────────────────────────────────────────────────────────────
-- Migration: 20260812000007_user_mfa_backup_codes_default
-- Purpose: Add an explicit `DEFAULT '{}'::text[]` to User.twoFactorBackupCodes
--          so Prisma's `create` calls (which send NULL when the caller omits
--          a non-defaulted array field) fall back to an empty array.
-- Safety:  ALTER COLUMN ... SET DEFAULT is non-destructive:
--            - Existing rows are NOT modified (their values stay as-is).
--            - Only NEW rows that don't explicitly set the field get the default.
--            - The column already has a DEFAULT from migration 20260811000007
--              (line 23), but Prisma's introspection sometimes drops the
--              default when the schema doesn't declare `@default(...)`. This
--              migration re-asserts it so the schema and DB stay in sync.
--          Idempotent: `SET DEFAULT` is safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "User"
  ALTER COLUMN "twoFactorBackupCodes" SET DEFAULT '{}'::text[];
