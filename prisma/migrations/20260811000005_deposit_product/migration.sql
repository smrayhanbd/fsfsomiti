-- ============================================================================
-- Migration: deposit_product (Roadmap item 22)
--
-- Adds DepositProduct (the rate-sheet template for fixed-term member deposits)
-- and MemberDeposit (a single member's principal under a product, with a
-- back-reference to the principal Transaction that funded it).
-- ============================================================================

CREATE TABLE "DepositProduct" (
    "id"                  TEXT          NOT NULL,
    "name"                TEXT          NOT NULL,
    "code"                TEXT          NOT NULL,
    "termMonths"          INTEGER       NOT NULL,
    "minAmount"           DECIMAL(14,2) NOT NULL,
    "maxAmount"           DECIMAL(14,2),
    "profitRate"          DECIMAL(5,4)  NOT NULL,
    "profitSharingRatio"  DECIMAL(5,4)  NOT NULL DEFAULT 0,
    "maturityBehavior"    TEXT          NOT NULL DEFAULT 'REINVEST',
    "status"              TEXT          NOT NULL DEFAULT 'ACTIVE',
    "createdAt"           TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3)  NOT NULL,

    CONSTRAINT "DepositProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DepositProduct_code_key" ON "DepositProduct"("code");
CREATE INDEX IF NOT EXISTS "DepositProduct_status_idx" ON "DepositProduct"("status");

CREATE TABLE "MemberDeposit" (
    "id"              TEXT          NOT NULL,
    "memberId"        TEXT          NOT NULL,
    "productId"       TEXT          NOT NULL,
    "principalAmount" DECIMAL(14,2) NOT NULL,
    "startDate"       DATE          NOT NULL,
    "maturityDate"    DATE          NOT NULL,
    "expectedProfit"  DECIMAL(14,2) NOT NULL,
    "status"          TEXT          NOT NULL DEFAULT 'ACTIVE',
    "transactionId"   TEXT,
    "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3)  NOT NULL,

    CONSTRAINT "MemberDeposit_pkey" PRIMARY KEY ("id")
);

-- 1:1 with Transaction (one principal-deposit Transaction funds at most one
-- MemberDeposit). @unique on transactionId is what makes Prisma happy with the
-- `transaction Transaction?` single-side relation.
CREATE UNIQUE INDEX IF NOT EXISTS "MemberDeposit_transactionId_key"
  ON "MemberDeposit"("transactionId");

CREATE INDEX IF NOT EXISTS "MemberDeposit_memberId_status_idx"
  ON "MemberDeposit"("memberId", "status");
CREATE INDEX IF NOT EXISTS "MemberDeposit_productId_idx"
  ON "MemberDeposit"("productId");

-- FK: MemberDeposit.memberId → Member (Restrict — never delete a member who
-- holds an active term deposit; the admin must withdraw / mature the deposit
-- first so the audit trail stays intact).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'MemberDeposit_memberId_fkey'
      AND conrelid = '"MemberDeposit"'::regclass
  ) THEN
    ALTER TABLE "MemberDeposit"
      ADD CONSTRAINT "MemberDeposit_memberId_fkey"
      FOREIGN KEY ("memberId") REFERENCES "Member"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'MemberDeposit_productId_fkey'
      AND conrelid = '"MemberDeposit"'::regclass
  ) THEN
    ALTER TABLE "MemberDeposit"
      ADD CONSTRAINT "MemberDeposit_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "DepositProduct"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- SetNull so deleting the underlying Transaction (rare — only via reversal)
  -- does not strand the deposit. The deposit keeps its principal amount +
  -- status; only the back-link is severed.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'MemberDeposit_transactionId_fkey'
      AND conrelid = '"MemberDeposit"'::regclass
  ) THEN
    ALTER TABLE "MemberDeposit"
      ADD CONSTRAINT "MemberDeposit_transactionId_fkey"
      FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Note: the Transaction.memberDeposit back-relation field in schema.prisma is
-- the implicit Prisma back-reference — no separate FK column on Transaction.
-- The 1:1 is enforced by the unique index on MemberDeposit.transactionId
-- above. No ALTER TABLE on Transaction is needed here.
