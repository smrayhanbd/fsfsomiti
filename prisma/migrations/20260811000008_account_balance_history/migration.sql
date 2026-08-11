-- ============================================================================
-- Migration: account_balance_history (D8)
--
-- Append-only audit trail of every Account.currentBalance mutation. Written
-- in the same $transaction as the JournalEntry post so the history can never
-- drift from the live balance. Drives the Account Ledger "running balance"
-- view without having to replay every JournalLine from the beginning of time.
-- ============================================================================

CREATE TABLE "AccountBalanceHistory" (
    "id"              TEXT          NOT NULL,
    "accountId"       TEXT          NOT NULL,
    "beforeBalance"   DECIMAL(16,2) NOT NULL,
    "afterBalance"    DECIMAL(16,2) NOT NULL,
    "delta"           DECIMAL(16,2) NOT NULL,
    "journalEntryId"  TEXT,
    "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountBalanceHistory_pkey" PRIMARY KEY ("id")
);

-- The Account Ledger running-balance query:
--   SELECT ... WHERE accountId = ? ORDER BY createdAt ASC;
CREATE INDEX IF NOT EXISTS "AccountBalanceHistory_accountId_createdAt_idx"
  ON "AccountBalanceHistory"("accountId", "createdAt");

-- FK: accountId → Account (Restrict — never delete an Account that has balance
-- history; the audit trail is permanent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AccountBalanceHistory_accountId_fkey'
      AND conrelid = '"AccountBalanceHistory"'::regclass
  ) THEN
    ALTER TABLE "AccountBalanceHistory"
      ADD CONSTRAINT "AccountBalanceHistory_accountId_fkey"
      FOREIGN KEY ("accountId") REFERENCES "Account"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- journalEntryId → JournalEntry (default cascade-restrict — nullify is fine
  -- too, but Prisma's @relation defaults to NO ACTION which we override to
  -- SET NULL so deleting a JournalEntry doesn't strand the balance history).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AccountBalanceHistory_journalEntryId_fkey'
      AND conrelid = '"AccountBalanceHistory"'::regclass
  ) THEN
    ALTER TABLE "AccountBalanceHistory"
      ADD CONSTRAINT "AccountBalanceHistory_journalEntryId_fkey"
      FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AccountBalanceHistory_journalEntryId_idx"
  ON "AccountBalanceHistory"("journalEntryId");
