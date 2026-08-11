-- PaymentIntent (Roadmap item 21 — bKash / Nagad gateway integration).
-- One row per in-flight gateway payment. Created in PENDING when the member
-- clicks "Pay with bKash" / "Pay with Nagad", moved to COMPLETED when the
-- gateway callback confirms the money landed (and the linked Transaction
-- is APPROVED + GL posted), or FAILED / CANCELLED otherwise.

CREATE TABLE "PaymentIntent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "merchantInvoice" TEXT NOT NULL,
  "amount" DECIMAL(14, 2) NOT NULL,
  "memberId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "transactionId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentIntent_merchantInvoice_key" ON "PaymentIntent"("merchantInvoice");
CREATE INDEX "PaymentIntent_memberId_status_idx" ON "PaymentIntent"("memberId", "status");
CREATE INDEX "PaymentIntent_providerPaymentId_idx" ON "PaymentIntent"("providerPaymentId");

ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT;

ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL;
