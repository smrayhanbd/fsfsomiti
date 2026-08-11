-- Member + MemberNominee signature uploads.
-- Backs the signature-image field on the Membership Application Form PDF.
-- Both columns are nullable so existing rows survive the migration; the
-- application layer enforces "required" at form-submit time (member signature
-- always required; nominee signature required only when the nominee is an adult).
ALTER TABLE "Member" ADD COLUMN "signatureUrl" TEXT;
ALTER TABLE "MemberNominee" ADD COLUMN "signatureUrl" TEXT;
