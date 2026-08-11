-- AlterTable
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "nplBucket" TEXT;
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "nplFlaggedAt" TIMESTAMP(3);
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "nplDaysPastDue" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Loan_nplBucket_idx" ON "Loan"("nplBucket");
