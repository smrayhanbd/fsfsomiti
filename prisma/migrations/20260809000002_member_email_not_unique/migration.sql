-- Drop the unique constraint on Member.email so one person can hold multiple
-- memberships with the same email address. Phone was already non-unique.
DROP INDEX IF EXISTS "Member_email_key";

-- Allow DRAFT + test elections to be hard-deleted by cascading deletion of
-- audit logs, settings snapshots, scheduled events, observer assignments,
-- eligibility overrides, recount requests, key rotations, and idempotency keys.
-- Ballots / Participation / Results remain ON DELETE RESTRICT so votes can
-- never be silently destroyed (spec §75: "no hard delete after voting begins").
-- ElectionCommittee.electionId is nullable → ON DELETE SET NULL (the committee
-- outlives the election it came from, but the link is severed if the election
-- is purged).

ALTER TABLE "ElectionAuditLog" DROP CONSTRAINT IF EXISTS "ElectionAuditLog_electionId_fkey";
ALTER TABLE "ElectionAuditLog" ADD CONSTRAINT "ElectionAuditLog_electionId_fkey"
  FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ElectionSettingsSnapshot" DROP CONSTRAINT IF EXISTS "ElectionSettingsSnapshot_electionId_fkey";
ALTER TABLE "ElectionSettingsSnapshot" ADD CONSTRAINT "ElectionSettingsSnapshot_electionId_fkey"
  FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ElectionScheduledEvent" DROP CONSTRAINT IF EXISTS "ElectionScheduledEvent_electionId_fkey";
ALTER TABLE "ElectionScheduledEvent" ADD CONSTRAINT "ElectionScheduledEvent_electionId_fkey"
  FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ElectionObserverAssignment" DROP CONSTRAINT IF EXISTS "ElectionObserverAssignment_electionId_fkey";
ALTER TABLE "ElectionObserverAssignment" ADD CONSTRAINT "ElectionObserverAssignment_electionId_fkey"
  FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ElectionEligibilityOverride" DROP CONSTRAINT IF EXISTS "ElectionEligibilityOverride_electionId_fkey";
ALTER TABLE "ElectionEligibilityOverride" ADD CONSTRAINT "ElectionEligibilityOverride_electionId_fkey"
  FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecountRequest" DROP CONSTRAINT IF EXISTS "RecountRequest_electionId_fkey";
ALTER TABLE "RecountRequest" ADD CONSTRAINT "RecountRequest_electionId_fkey"
  FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BallotKeyRotation" DROP CONSTRAINT IF EXISTS "BallotKeyRotation_electionId_fkey";
ALTER TABLE "BallotKeyRotation" ADD CONSTRAINT "BallotKeyRotation_electionId_fkey"
  FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ElectionIdempotencyKey" DROP CONSTRAINT IF EXISTS "ElectionIdempotencyKey_electionId_fkey";
ALTER TABLE "ElectionIdempotencyKey" ADD CONSTRAINT "ElectionIdempotencyKey_electionId_fkey"
  FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ElectionCommittee" DROP CONSTRAINT IF EXISTS "ElectionCommittee_electionId_fkey";
ALTER TABLE "ElectionCommittee" ADD CONSTRAINT "ElectionCommittee_electionId_fkey"
  FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE SET NULL ON UPDATE CASCADE;
