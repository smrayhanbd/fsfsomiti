-- ============================================================================
-- Migration: schema_followups (D9 + D17 + D18)
--
-- D9:  CHECK constraints on Transaction for nullable FKs
-- D17: Partial unique indexes on TaskAssignee per assigneeType
-- D18: Explicit onDelete: RESTRICT on Election audit FKs to User
--
-- Idempotent — uses IF EXISTS / IF NOT EXISTS guards throughout.
-- ============================================================================

-- ─── D9: Transaction CHECK constraints ────────────────────────────────────
-- DEPOSIT and WITHDRAWAL transactions must have a cashAccountId.
ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "transaction_cash_account_required";
ALTER TABLE "Transaction" ADD CONSTRAINT "transaction_cash_account_required"
  CHECK (
    "transactionType" NOT IN ('DEPOSIT', 'WITHDRAWAL') OR "cashAccountId" IS NOT NULL
  );

-- DEPOSIT and WITHDRAWAL transactions must have a memberId (a savings/withdrawal
-- without a member makes no sense in this domain).
ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "transaction_member_required";
ALTER TABLE "Transaction" ADD CONSTRAINT "transaction_member_required"
  CHECK (
    "transactionType" NOT IN ('DEPOSIT', 'WITHDRAWAL') OR "memberId" IS NOT NULL
  );

-- ─── D17: TaskAssignee partial unique indexes ───────────────────────────
-- Replace the brittle composite unique on 5 nullable columns with per-type
-- partial uniques. SQL NULLs are distinct in unique indexes, so the old
-- constraint didn't actually prevent duplicates for STAFF/COMMITTEE types
-- when the user/member FK was null.
ALTER TABLE "TaskAssignee" DROP CONSTRAINT IF EXISTS "TaskAssignee_taskId_assigneeType_userId_memberId_committeeId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "TaskAssignee_staff_unique"
  ON "TaskAssignee"("taskId", "userId")
  WHERE "assigneeType" = 'STAFF' AND "userId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "TaskAssignee_member_unique"
  ON "TaskAssignee"("taskId", "memberId")
  WHERE "assigneeType" = 'MEMBER' AND "memberId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "TaskAssignee_committee_unique"
  ON "TaskAssignee"("taskId", "committeeId")
  WHERE "assigneeType" = 'COMMITTEE' AND "committeeId" IS NOT NULL;

-- ─── D18: Election FKs explicit onDelete: RESTRICT ───────────────────────
-- Deleting an admin user who oversaw an election should fail loudly (the
-- audit trail of "who created/approved this" must be retained). RESTRICT
-- is the safer default; the application can reassign or null the field
-- explicitly if needed.

-- Election.createdById
ALTER TABLE "Election" DROP CONSTRAINT IF EXISTS "Election_createdById_fkey";
ALTER TABLE "Election" ADD CONSTRAINT "Election_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT;

-- ElectionNomination.reviewedById
ALTER TABLE "ElectionNomination" DROP CONSTRAINT IF EXISTS "ElectionNomination_reviewedById_fkey";
ALTER TABLE "ElectionNomination" ADD CONSTRAINT "ElectionNomination_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT;

-- ElectionCandidate.approvedById
ALTER TABLE "ElectionCandidate" DROP CONSTRAINT IF EXISTS "ElectionCandidate_approvedById_fkey";
ALTER TABLE "ElectionCandidate" ADD CONSTRAINT "ElectionCandidate_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT;

-- RecountRequest.requestedById
ALTER TABLE "RecountRequest" DROP CONSTRAINT IF EXISTS "RecountRequest_requestedById_fkey";
ALTER TABLE "RecountRequest" ADD CONSTRAINT "RecountRequest_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT;

-- ElectionObserverAssignment.assignedById
ALTER TABLE "ElectionObserverAssignment" DROP CONSTRAINT IF EXISTS "ElectionObserverAssignment_assignedById_fkey";
ALTER TABLE "ElectionObserverAssignment" ADD CONSTRAINT "ElectionObserverAssignment_assignedById_fkey"
  FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT;

-- ElectionSettingsSnapshot.capturedById
ALTER TABLE "ElectionSettingsSnapshot" DROP CONSTRAINT IF EXISTS "ElectionSettingsSnapshot_capturedById_fkey";
ALTER TABLE "ElectionSettingsSnapshot" ADD CONSTRAINT "ElectionSettingsSnapshot_capturedById_fkey"
  FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE RESTRICT;

-- BallotKeyRotation.activatedById
ALTER TABLE "BallotKeyRotation" DROP CONSTRAINT IF EXISTS "BallotKeyRotation_activatedById_fkey";
ALTER TABLE "BallotKeyRotation" ADD CONSTRAINT "BallotKeyRotation_activatedById_fkey"
  FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE RESTRICT;

-- ElectionEligibilityOverride.overriddenById
ALTER TABLE "ElectionEligibilityOverride" DROP CONSTRAINT IF EXISTS "ElectionEligibilityOverride_overriddenById_fkey";
ALTER TABLE "ElectionEligibilityOverride" ADD CONSTRAINT "ElectionEligibilityOverride_overriddenById_fkey"
  FOREIGN KEY ("overriddenById") REFERENCES "User"("id") ON DELETE RESTRICT;
