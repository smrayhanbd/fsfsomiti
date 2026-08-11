-- Member deposit-request workflow (portal -> admin approval).
-- Extends MemberRequest with the metadata needed for a member to submit a
-- deposit request with an attached deposit slip / transaction document, and
-- for an admin to record the review decision.
--
-- All new columns are nullable / have defaults so existing WITHDRAWAL and
-- CLOSING rows survive the migration unchanged. The application layer reads
-- them only when type = 'DEPOSIT'.

-- Slip / transaction proof uploaded by the member. JSON array of
-- {type, name, url} — same shape as Transaction.attachments so the admin
-- approval queue can render them with the same component.
ALTER TABLE "MemberRequest" ADD COLUMN "attachments" JSONB NOT NULL DEFAULT '[]';

-- Optional collection-type / breakdown snapshot for DEPOSIT requests,
-- mirroring Transaction.breakdown. Stored as JSON so future fields can be
-- added without another migration.
ALTER TABLE "MemberRequest" ADD COLUMN "breakdown" JSONB;

-- Bank transaction id / cheque no. / bKash trxId — printed on the slip.
ALTER TABLE "MemberRequest" ADD COLUMN "referenceNo" TEXT;

-- Date the money was actually sent (may differ from createdAt).
ALTER TABLE "MemberRequest" ADD COLUMN "transactionDate" TIMESTAMP(3);

-- Filled by the admin when rejecting a deposit request, so the member sees
-- the reason in their portal "My Requests" page.
ALTER TABLE "MemberRequest" ADD COLUMN "rejectionReason" TEXT;

-- Audit: who approved / rejected, and when.
ALTER TABLE "MemberRequest" ADD COLUMN "reviewedBy" TEXT;
ALTER TABLE "MemberRequest" ADD COLUMN "reviewedAt" TIMESTAMP(3);
