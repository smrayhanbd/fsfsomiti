-- ============================================================================
-- Migration: user_mfa (Roadmap item 13)
--
-- Adds TOTP-based 2FA fields to the User table. `twoFactorEnabled` and
-- `twoFactorSecret` already existed (added by migration
-- 20260720000001_transactions_and_user_mgmt); this migration:
--   • adds lastMfaAt (timestamp of most recent successful MFA challenge),
--   • adds passwordChangedAt (session-invalidation watermark — sessions
--     issued before this timestamp are rejected by next-auth's session
--     callback),
--   • re-asserts the existing MFA columns idempotently so a fresh DB
--     applying these migrations in order has all 5 fields present.
-- ============================================================================

-- `twoFactorSecret` already exists on existing DBs — IF NOT EXISTS guard makes
-- this migration safe to apply on either a fresh DB or a pre-MFA DB.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorSecret"      TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorEnabled"     BOOLEAN NOT NULL DEFAULT false;

-- `twoFactorBackupCodes` is TEXT[]. The existing migration added it with a
-- DEFAULT '{}' so existing rows are valid. We re-assert with the same default
-- for fresh-DB compatibility.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorBackupCodes" TEXT[] NOT NULL DEFAULT '{}';

-- New columns: timestamps for the MFA audit dashboard and session invalidation.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastMfaAt"         TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);

-- Index so the audit dashboard can quickly find "users with 2FA enabled who
-- haven't authenticated via MFA in N days" without a full table scan.
CREATE INDEX IF NOT EXISTS "User_twoFactorEnabled_lastMfaAt_idx"
  ON "User"("twoFactorEnabled", "lastMfaAt");
