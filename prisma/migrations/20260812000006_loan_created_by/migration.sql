-- ─────────────────────────────────────────────────────────────────────────
-- Migration: 20260812000006_loan_created_by
-- Purpose: Add createdById / createdBy columns to "Loan" so Maker-Checker
--          can be enforced on loan approvals.
-- Safety:  ADDITIVE ONLY — no data is lost, no existing column is renamed
--          or dropped. Both columns are NULLABLE so existing loan rows
--          (created before this migration) keep working; the application
--          treats NULL as "unknown creator" and skips the Maker-Checker
--          self-approval check for those legacy rows (the check only
--          applies when createdById is non-NULL).
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "Loan"
  ADD COLUMN IF NOT EXISTS "createdById" TEXT,
  ADD COLUMN IF NOT EXISTS "createdBy"    TEXT;

-- Optional index for "loans created by user X" queries (admin dashboard).
CREATE INDEX IF NOT EXISTS "Loan_createdById_idx" ON "Loan"("createdById");
