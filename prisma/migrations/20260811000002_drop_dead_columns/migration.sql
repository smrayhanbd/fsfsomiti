-- ============================================================================
-- Migration: drop_dead_columns (D1)
--
-- Drops the `slipUrl` and `transactionRef` columns from MemberRequest. These
-- were added by the duplicate-timestamp migration 20260808000001_deposit_request_slip
-- (renamed to 20260808000000 by migration 20260811000003_rename_duplicate_migration)
-- but never wired into schema.prisma or the application code. The actually-
-- used deposit-request fields (attachments, breakdown, referenceNo,
-- transactionDate, rejectionReason, reviewedBy/At) were added by the OTHER
-- 20260808000001 migration (member_deposit_request) and are untouched here.
--
-- `DROP COLUMN IF EXISTS` so this migration is idempotent: a fresh DB that
-- applied 20260808000001_deposit_request_slip will drop the columns; a DB
-- where the rename has already run (and the slip migration applied first) will
-- also drop them; a DB that never had them is a no-op.
-- ============================================================================
ALTER TABLE "MemberRequest" DROP COLUMN IF EXISTS "slipUrl";
ALTER TABLE "MemberRequest" DROP COLUMN IF EXISTS "transactionRef";
