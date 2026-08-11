-- ============================================================================
-- Migration: financial_year (Roadmap item 24)
--
-- Adds the FinancialYear model so journal entries can be tagged with the
-- fiscal year they were posted in, and the trial-balance / P&L / balance-sheet
-- reports can filter to a specific year. The User ↔ FinancialYear closedBy
-- relation lets the audit UI show who closed a year.
-- ============================================================================

CREATE TABLE "FinancialYear" (
    "id"          TEXT        NOT NULL,
    "name"        TEXT        NOT NULL,
    "startDate"   DATE        NOT NULL,
    "endDate"     DATE        NOT NULL,
    "status"      TEXT        NOT NULL DEFAULT 'OPEN',
    "closedById"  TEXT,
    "closedAt"    TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialYear_pkey" PRIMARY KEY ("id")
);

-- Two years can never share the same start date.
CREATE UNIQUE INDEX IF NOT EXISTS "FinancialYear_startDate_key"
  ON "FinancialYear"("startDate");

CREATE INDEX IF NOT EXISTS "FinancialYear_status_idx" ON "FinancialYear"("status");

-- FK: closedById → User, SetNull (closing-admin churn shouldn't strand the year).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'FinancialYear_closedById_fkey'
      AND conrelid = '"FinancialYear"'::regclass
  ) THEN
    ALTER TABLE "FinancialYear"
      ADD CONSTRAINT "FinancialYear_closedById_fkey"
      FOREIGN KEY ("closedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "FinancialYear_closedById_idx" ON "FinancialYear"("closedById");

-- ─── JournalEntry.financialYearId → FinancialYear (SetNull) ───────────────────
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "financialYearId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'JournalEntry_financialYearId_fkey'
      AND conrelid = '"JournalEntry"'::regclass
  ) THEN
    ALTER TABLE "JournalEntry"
      ADD CONSTRAINT "JournalEntry_financialYearId_fkey"
      FOREIGN KEY ("financialYearId") REFERENCES "FinancialYear"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "JournalEntry_financialYearId_idx" ON "JournalEntry"("financialYearId");
