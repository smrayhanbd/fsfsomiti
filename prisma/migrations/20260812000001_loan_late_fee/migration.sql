-- Late-payment interest / penalty (Roadmap item 17).
-- Adds the rate + grace-days config to LoanProduct, and a running
-- lateFeeAccrued total to each LoanSchedule row.

ALTER TABLE "LoanProduct"
  ADD COLUMN IF NOT EXISTS "lateFeePercent" Decimal(5, 4),
  ADD COLUMN IF NOT EXISTS "lateFeeGraceDays" INTEGER NOT NULL DEFAULT 7;

ALTER TABLE "LoanSchedule"
  ADD COLUMN IF NOT EXISTS "lateFeeAccrued" Decimal(12, 2) NOT NULL DEFAULT 0;
