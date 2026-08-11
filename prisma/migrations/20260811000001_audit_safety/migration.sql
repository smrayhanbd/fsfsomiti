-- ============================================================================
-- Migration: audit_safety
-- Combines several Phase-3 audit fixes:
--   • B11–B14, B19–B20: optimistic-concurrency `version` columns on financial
--     and election entities.
--   • B8:    Loan audit-trail columns (who approved / disbursed / wrote off / reversed).
--   • B21:   Loan.journalEntryId → JournalEntry (write-off voucher).
--   • B24:   ElectionBallot(electionId, memberId) unique constraint to prevent
--            double-voting, plus the memberId column the constraint needs.
--   • B25:   LoanSchedule(loanId, installmentNo) unique constraint.
--   • D5:   Savings audit columns (promote from placeholder).
--   • D6:   Document Member.deletedAt soft-delete policy in schema.prisma.
--   • D8:   Back-relation FK for AccountBalanceHistory on Account (the table
--           itself is created in migration 20260811000008_account_balance_history).
--   • D11:  Notification(isRead, createdAt DESC) composite index.
--   • D15:  MemberRequest.reviewedById + createdById FK → User, SetNull.
--   • D16:  Composite indexes on Loan, Transaction, MemberRequest, LoanRepayment,
--           Account, JournalEntry.
--   • D20:  Backup.expiresAt + storageUrl + storageProvider.
-- ============================================================================

-- ─── B11: Transaction.version ───────────────────────────────────────────────
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

-- ─── B11 (cont.): Transaction.memberDepositId is added in migration
--     20260811000005_deposit_product (the FK target table does not exist yet).

-- ─── B12: Loan.version ───────────────────────────────────────────────────────
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

-- ─── B13: IncomeDistribution.version ────────────────────────────────────────
ALTER TABLE "IncomeDistribution" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

-- ─── B14: Investment.version ───────────────────────────────────────────────
ALTER TABLE "Investment" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

-- ─── B19: ElectionNomination.version ────────────────────────────────────────
ALTER TABLE "ElectionNomination" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

-- ─── B20: Election.version ──────────────────────────────────────────────────
ALTER TABLE "Election" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

-- ─── B8: Loan audit-trail columns ────────────────────────────────────────────
-- All nullable so existing rows survive. Stored as userId strings (no FK to
-- User) so admin users can be deleted without breaking loan audit history.
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "approvedById"   TEXT;
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "approvedAt"     TIMESTAMP(3);
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "disbursedById"  TEXT;
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "disbursedAt"    TIMESTAMP(3);
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "writeOffById"   TEXT;
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "writeOffAt"     TIMESTAMP(3);
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "reversedById"   TEXT;
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "reversedAt"     TIMESTAMP(3);

-- ─── B21: Loan.journalEntryId → JournalEntry (write-off voucher) ─────────────
-- SetNull so deleting the JournalEntry does not strand the loan without its
-- write-off reference (the loan keeps its WRITTEN_OFF status regardless).
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "journalEntryId" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Loan_journalEntryId_fkey'
      AND conrelid = '"Loan"'::regclass
  ) THEN
    ALTER TABLE "Loan"
      ADD CONSTRAINT "Loan_journalEntryId_fkey"
      FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "Loan_journalEntryId_idx" ON "Loan"("journalEntryId");

-- ─── B25: LoanSchedule(loanId, installmentNo) unique ────────────────────────
-- Prevents two installments with the same number on the same loan.
CREATE UNIQUE INDEX IF NOT EXISTS "LoanSchedule_loanId_installmentNo_key"
  ON "LoanSchedule"("loanId", "installmentNo");

-- ─── B24: ElectionBallot(electionId, memberId) unique ───────────────────────
-- First add the memberId column (nullable for backward compat with pre-existing
-- rows). Postgres excludes NULL from unique indexes, so the constraint only
-- fires once memberId is populated — legacy ballots stay valid.
ALTER TABLE "ElectionBallot" ADD COLUMN IF NOT EXISTS "memberId" TEXT;

-- FK to Member so the audit trail survives member churn (a member's ballots
-- should follow them out the door — cascade delete).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ElectionBallot_memberId_fkey'
      AND conrelid = '"ElectionBallot"'::regclass
  ) THEN
    ALTER TABLE "ElectionBallot"
      ADD CONSTRAINT "ElectionBallot_memberId_fkey"
      FOREIGN KEY ("memberId") REFERENCES "Member"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ElectionBallot_electionId_memberId_key"
  ON "ElectionBallot"("electionId", "memberId");
CREATE INDEX IF NOT EXISTS "ElectionBallot_memberId_idx" ON "ElectionBallot"("memberId");

-- ─── D11: Notification(isRead, createdAt DESC) ──────────────────────────────
CREATE INDEX IF NOT EXISTS "Notification_isRead_createdAt_idx"
  ON "Notification"("isRead", "createdAt" DESC);

-- ─── D16: Loan(memberId, status) ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Loan_memberId_status_idx" ON "Loan"("memberId", "status");

-- ─── D16: Transaction(subType, transactionDate) ──────────────────────────────
CREATE INDEX IF NOT EXISTS "Transaction_subType_transactionDate_idx"
  ON "Transaction"("subType", "transactionDate");

-- ─── D16: MemberRequest(type, status, createdAt) ──────────────────────────────
CREATE INDEX IF NOT EXISTS "MemberRequest_type_status_createdAt_idx"
  ON "MemberRequest"("type", "status", "createdAt");

-- ─── D16: LoanRepayment(memberId, paymentDate) ────────────────────────────────
CREATE INDEX IF NOT EXISTS "LoanRepayment_memberId_paymentDate_idx"
  ON "LoanRepayment"("memberId", "paymentDate");

-- ─── D16: Account(accountType, status) ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Account_accountType_status_idx"
  ON "Account"("accountType", "status");

-- ─── D16: JournalEntry(entryDate, status, voucherType) ────────────────────────
CREATE INDEX IF NOT EXISTS "JournalEntry_entryDate_status_voucherType_idx"
  ON "JournalEntry"("entryDate", "status", "voucherType");

-- ─── D20: Backup cloud-retention columns ──────────────────────────────────────
ALTER TABLE "Backup" ADD COLUMN IF NOT EXISTS "expiresAt"       TIMESTAMP(3);
ALTER TABLE "Backup" ADD COLUMN IF NOT EXISTS "storageUrl"      TEXT;
-- NOT NULL with default 'local' so existing rows are valid without backfill.
ALTER TABLE "Backup" ADD COLUMN IF NOT EXISTS "storageProvider" TEXT NOT NULL DEFAULT 'local';

-- ─── D5: Savings audit columns (promote from placeholder) ────────────────────
ALTER TABLE "Savings" ADD COLUMN IF NOT EXISTS "updatedBy"           TEXT;
ALTER TABLE "Savings" ADD COLUMN IF NOT EXISTS "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Savings" ADD COLUMN IF NOT EXISTS "transactionMirrorId" TEXT;
ALTER TABLE "Savings" ADD COLUMN IF NOT EXISTS "journalLineId"       TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Savings_transactionMirrorId_key" ON "Savings"("transactionMirrorId");
CREATE INDEX IF NOT EXISTS "Savings_journalLineId_idx" ON "Savings"("journalLineId");

-- ─── D15: MemberRequest.reviewedById + createdById → User (SetNull) ──────────
ALTER TABLE "MemberRequest" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;
ALTER TABLE "MemberRequest" ADD COLUMN IF NOT EXISTS "createdById"  TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'MemberRequest_reviewedById_fkey'
      AND conrelid = '"MemberRequest"'::regclass
  ) THEN
    ALTER TABLE "MemberRequest"
      ADD CONSTRAINT "MemberRequest_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'MemberRequest_createdById_fkey'
      AND conrelid = '"MemberRequest"'::regclass
  ) THEN
    ALTER TABLE "MemberRequest"
      ADD CONSTRAINT "MemberRequest_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "MemberRequest_reviewedById_idx" ON "MemberRequest"("reviewedById");
CREATE INDEX IF NOT EXISTS "MemberRequest_createdById_idx"  ON "MemberRequest"("createdById");

-- ─── D6: Member.deletedAt documentation ───────────────────────────────────────
-- No SQL needed: the `deletedAt` column already exists on the Member table
-- (added by migration 20260720000001_transactions_and_user_mgmt). The policy
-- change (deleteMember now sets deletedAt = now() AND status = 'CLOSED' instead
-- of hard-deleting) is enforced in the application layer — see app/actions/
-- member.ts. The behavior is documented as a comment on the `deletedAt` field
-- in prisma/schema.prisma so future contributors don't accidentally use
-- prisma.member.delete() and break the audit trail.

-- ─── D8 (back-relation preparation) ──────────────────────────────────────────
-- The AccountBalanceHistory table itself is created by migration
-- 20260811000008_account_balance_history. No FK work needed here — that
-- migration owns both the table and its Account / JournalEntry FKs.
