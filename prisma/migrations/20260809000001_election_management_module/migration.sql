-- Election Management Module (Spec v2.0)
-- Adds direct member voting for the Executive Committee with encrypted
-- confidential ballots, deterministic counting, tie handling, runoff elections,
-- quorum validation, audit trails, and observer monitoring.
--
-- Modifications from spec: see worklog.md §M1–M12 (model renames, uuid IDs, etc.)

-- Enum types
CREATE TYPE "ElectionStatus" AS ENUM ('DRAFT', 'NOMINATION_OPEN', 'NOMINATION_CLOSED', 'CANDIDATES_FINALIZED', 'VOTING_SCHEDULED', 'VOTING_OPEN', 'VOTING_CLOSED', 'COUNTING', 'RESULTS_READY', 'RESULTS_PUBLISHED', 'COMMITTEE_FORMED', 'ARCHIVED', 'CANCELLED', 'FROZEN', 'RUNOFF_REQUIRED');
CREATE TYPE "NominationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'DISQUALIFIED');
CREATE TYPE "CandidateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'DISQUALIFIED', 'UNCONTESTED_ELECTED');
CREATE TYPE "VoteStatus" AS ENUM ('VALID', 'INVALID');
CREATE TYPE "BallotStorageMode" AS ENUM ('RELATIONAL', 'ENCRYPTED');
CREATE TYPE "TieBreakingMethod" AS ENUM ('RUNOFF_ELECTION', 'COMMITTEE_DECISION', 'LOTTERY_DRAW', 'PREVIOUS_TERM', 'SENIORITY');
CREATE TYPE "UncontestedPolicy" AS ENUM ('AUTO_ELECT', 'STILL_REQUIRE_VOTE');
CREATE TYPE "ElectionAuditAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED_DRAFT', 'CLONED', 'NOMINATION_OPENED', 'NOMINATION_CLOSED', 'CANDIDATE_APPROVED', 'CANDIDATE_REJECTED', 'CANDIDATE_WITHDRAWN', 'CANDIDATE_DISQUALIFIED', 'CANDIDATES_FINALIZED', 'ELIGIBILITY_SNAPSHOT_CREATED', 'ELIGIBILITY_OVERRIDDEN', 'VOTING_OPENED', 'VOTING_CLOSED', 'VOTING_REOPENED', 'BALLOT_CAST', 'BALLOT_INVALIDATED', 'COUNTING_STARTED', 'COUNTING_COMPLETED', 'RESULTS_PUBLISHED', 'RESULTS_PARTIALLY_PUBLISHED', 'RUNOFF_CREATED', 'TIE_RESOLVED', 'COMMITTEE_FORMED', 'COMMITTEE_VACANCY', 'CANCELLED', 'FROZEN', 'UNFROZEN', 'QUORUM_NOT_MET', 'TEST_ELECTION_CREATED', 'TEST_ELECTION_PURGED', 'KEY_ROTATED', 'RECOUNT_PERFORMED');
CREATE TYPE "ElectionNotificationType" AS ENUM ('NOMINATION_OPENED', 'NOMINATION_CLOSING_SOON', 'NOMINATION_CLOSED', 'VOTING_OPENED', 'VOTING_REMINDER', 'VOTING_CLOSING_SOON', 'VOTING_CLOSED', 'VOTING_REOPENED', 'RESULTS_PUBLISHED', 'RESULTS_PARTIALLY_PUBLISHED', 'ELECTION_CANCELLED', 'ELECTION_FROZEN', 'ELECTION_UNFROZEN', 'RUNOFF_SCHEDULED', 'COMMITTEE_FORMED', 'QUORUM_NOT_MET');

-- Tables
CREATE TABLE "Election" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "termStartDate" TIMESTAMP(3) NOT NULL,
    "termEndDate" TIMESTAMP(3) NOT NULL,
    "nominationStartAt" TIMESTAMP(3) NOT NULL,
    "nominationEndAt" TIMESTAMP(3) NOT NULL,
    "votingStartAt" TIMESTAMP(3) NOT NULL,
    "votingEndAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dhaka',
    "status" "ElectionStatus" NOT NULL DEFAULT 'DRAFT',
    "previousStatus" "ElectionStatus",
    "allowSelfNomination" BOOLEAN NOT NULL DEFAULT true,
    "allowMemberNomination" BOOLEAN NOT NULL DEFAULT false,
    "secretBallot" BOOLEAN NOT NULL DEFAULT true,
    "showLiveResults" BOOLEAN NOT NULL DEFAULT false,
    "maxPositionsPerCandidate" INTEGER NOT NULL DEFAULT 1,
    "minTurnoutPercentage" DECIMAL(5,2),
    "quorumRequired" BOOLEAN NOT NULL DEFAULT false,
    "allowTermOverlap" BOOLEAN NOT NULL DEFAULT false,
    "ballotStorageMode" "BallotStorageMode" NOT NULL DEFAULT 'ENCRYPTED',
    "tieBreakingMethod" "TieBreakingMethod" NOT NULL DEFAULT 'RUNOFF_ELECTION',
    "isTestElection" BOOLEAN NOT NULL DEFAULT false,
    "parentElectionId" TEXT,
    "isRunoff" BOOLEAN NOT NULL DEFAULT false,
    "runoffPositionId" TEXT,
    "activeKeyId" TEXT,
    "rulesJson" JSONB,
    "eligibilityRulesJson" JSONB,
    "candidateListHash" TEXT,
    "eligibilitySnapshotHash" TEXT,
    "resultHash" TEXT,
    "configHash" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Election_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Election_code_key" ON "Election"("code");
CREATE INDEX "Election_status_idx" ON "Election"("status");
CREATE INDEX "Election_votingStartAt_idx" ON "Election"("votingStartAt");
CREATE INDEX "Election_votingEndAt_idx" ON "Election"("votingEndAt");
CREATE INDEX "Election_isTestElection_idx" ON "Election"("isTestElection");
CREATE INDEX "Election_parentElectionId_idx" ON "Election"("parentElectionId");

CREATE TABLE "ElectionPosition" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "seatCount" INTEGER NOT NULL DEFAULT 1,
    "minSelections" INTEGER NOT NULL DEFAULT 1,
    "maxSelections" INTEGER NOT NULL DEFAULT 1,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "showNOTA" BOOLEAN NOT NULL DEFAULT true,
    "allowSkip" BOOLEAN NOT NULL DEFAULT false,
    "uncontestedPolicy" "UncontestedPolicy" NOT NULL DEFAULT 'AUTO_ELECT',
    "resultsPublishedAt" TIMESTAMP(3),
    "resultsPublishedById" TEXT,
    "resultsPublished" BOOLEAN NOT NULL DEFAULT false,
    "runoffRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElectionPosition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ElectionPosition_electionId_code_key" ON "ElectionPosition"("electionId", "code");
CREATE INDEX "ElectionPosition_electionId_displayOrder_idx" ON "ElectionPosition"("electionId", "displayOrder");

CREATE TABLE "ElectionEligibility" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "eligible" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "determinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshotId" TEXT,

    CONSTRAINT "ElectionEligibility_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ElectionEligibility_electionId_memberId_key" ON "ElectionEligibility"("electionId", "memberId");
CREATE INDEX "ElectionEligibility_memberId_idx" ON "ElectionEligibility"("memberId");
CREATE INDEX "ElectionEligibility_electionId_eligible_idx" ON "ElectionEligibility"("electionId", "eligible");

CREATE TABLE "ElectionEligibilityOverride" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "originalEligible" BOOLEAN NOT NULL,
    "overriddenEligible" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "overriddenById" TEXT NOT NULL,
    "overriddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectionEligibilityOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ElectionEligibilityOverride_electionId_memberId_key" ON "ElectionEligibilityOverride"("electionId", "memberId");

CREATE TABLE "ElectionNomination" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "statement" TEXT,
    "manifesto" TEXT,
    "experience" TEXT,
    "supportingInfo" TEXT,
    "photoUrl" TEXT,
    "status" "NominationStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElectionNomination_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ElectionNomination_electionId_positionId_memberId_key" ON "ElectionNomination"("electionId", "positionId", "memberId");
CREATE INDEX "ElectionNomination_electionId_status_idx" ON "ElectionNomination"("electionId", "status");
CREATE INDEX "ElectionNomination_memberId_idx" ON "ElectionNomination"("memberId");

CREATE TABLE "ElectionCandidate" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "candidateNumber" TEXT,
    "photoUrl" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "disqualifiedAt" TIMESTAMP(3),
    "disqualifiedById" TEXT,
    "disqualificationReason" TEXT,
    "electedAt" TIMESTAMP(3),
    "electionMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElectionCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ElectionCandidate_electionId_positionId_memberId_key" ON "ElectionCandidate"("electionId", "positionId", "memberId");
CREATE INDEX "ElectionCandidate_electionId_positionId_status_idx" ON "ElectionCandidate"("electionId", "positionId", "status");
CREATE INDEX "ElectionCandidate_memberId_idx" ON "ElectionCandidate"("memberId");

CREATE TABLE "ElectionBallot" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "ballotReference" TEXT NOT NULL,
    "encryptedData" TEXT NOT NULL,
    "dataHash" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "status" "VoteStatus" NOT NULL DEFAULT 'VALID',
    "invalidReason" TEXT,
    "castAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientIpHash" TEXT,
    "userAgentHash" TEXT,

    CONSTRAINT "ElectionBallot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ElectionBallot_ballotReference_key" ON "ElectionBallot"("ballotReference");
CREATE INDEX "ElectionBallot_electionId_castAt_idx" ON "ElectionBallot"("electionId", "castAt");
CREATE INDEX "ElectionBallot_dataHash_idx" ON "ElectionBallot"("dataHash");
CREATE INDEX "ElectionBallot_status_idx" ON "ElectionBallot"("status");

CREATE TABLE "BallotSelection" (
    "id" TEXT NOT NULL,
    "ballotId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,

    CONSTRAINT "BallotSelection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BallotSelection_ballotId_positionId_candidateId_key" ON "BallotSelection"("ballotId", "positionId", "candidateId");
CREATE INDEX "BallotSelection_positionId_candidateId_idx" ON "BallotSelection"("positionId", "candidateId");

CREATE TABLE "BallotKeyRotation" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedById" TEXT NOT NULL,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "BallotKeyRotation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BallotKeyRotation_keyId_key" ON "BallotKeyRotation"("keyId");
CREATE INDEX "BallotKeyRotation_electionId_activatedAt_idx" ON "BallotKeyRotation"("electionId", "activatedAt");

CREATE TABLE "ElectionParticipation" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "voted" BOOLEAN NOT NULL DEFAULT false,
    "votedAt" TIMESTAMP(3),
    "participationHash" TEXT,

    CONSTRAINT "ElectionParticipation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ElectionParticipation_electionId_memberId_key" ON "ElectionParticipation"("electionId", "memberId");
CREATE INDEX "ElectionParticipation_electionId_voted_idx" ON "ElectionParticipation"("electionId", "voted");

CREATE TABLE "ElectionResult" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "candidateId" TEXT,
    "label" TEXT NOT NULL,
    "voteCount" INTEGER NOT NULL,
    "votePercentage" DECIMAL(5,2),
    "rank" INTEGER,
    "elected" BOOLEAN NOT NULL DEFAULT false,
    "electionMethod" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectionResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ElectionResult_electionId_positionId_candidateId_key" ON "ElectionResult"("electionId", "positionId", "candidateId");
CREATE INDEX "ElectionResult_electionId_positionId_elected_idx" ON "ElectionResult"("electionId", "positionId", "elected");
CREATE INDEX "ElectionResult_electionId_positionId_rank_idx" ON "ElectionResult"("electionId", "positionId", "rank");

CREATE TABLE "RecountRequest" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "recountResult" JSONB,
    "resultHash" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "RecountRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecountRequest_electionId_status_idx" ON "RecountRequest"("electionId", "status");

CREATE TABLE "ElectionCommittee" (
    "id" TEXT NOT NULL,
    "electionId" TEXT,
    "name" TEXT NOT NULL,
    "termStartDate" TIMESTAMP(3) NOT NULL,
    "termEndDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectionCommittee_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ElectionCommittee_termStartDate_termEndDate_idx" ON "ElectionCommittee"("termStartDate", "termEndDate");
CREATE INDEX "ElectionCommittee_status_idx" ON "ElectionCommittee"("status");

CREATE TABLE "ElectionCommitteeMember" (
    "id" TEXT NOT NULL,
    "committeeId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "positionName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "electionMethod" TEXT,

    CONSTRAINT "ElectionCommitteeMember_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ElectionCommitteeMember_committeeId_idx" ON "ElectionCommitteeMember"("committeeId");
CREATE INDEX "ElectionCommitteeMember_memberId_idx" ON "ElectionCommitteeMember"("memberId");
CREATE INDEX "ElectionCommitteeMember_active_idx" ON "ElectionCommitteeMember"("active");

CREATE TABLE "ElectionCommitteeVacancy" (
    "id" TEXT NOT NULL,
    "committeeId" TEXT NOT NULL,
    "positionName" TEXT NOT NULL,
    "vacatedById" TEXT NOT NULL,
    "vacatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "filledById" TEXT,
    "filledAt" TIMESTAMP(3),
    "fillMethod" TEXT,

    CONSTRAINT "ElectionCommitteeVacancy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ElectionCommitteeVacancy_committeeId_idx" ON "ElectionCommitteeVacancy"("committeeId");
CREATE INDEX "ElectionCommitteeVacancy_fillMethod_idx" ON "ElectionCommitteeVacancy"("fillMethod");

CREATE TABLE "ElectionAuditLog" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "action" "ElectionAuditAction" NOT NULL,
    "performedById" TEXT,
    "performedByRole" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectionAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ElectionAuditLog_electionId_createdAt_idx" ON "ElectionAuditLog"("electionId", "createdAt");
CREATE INDEX "ElectionAuditLog_action_idx" ON "ElectionAuditLog"("action");

CREATE TABLE "ElectionObserverAssignment" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "assignedById" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ElectionObserverAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ElectionObserverAssignment_electionId_userId_key" ON "ElectionObserverAssignment"("electionId", "userId");
CREATE INDEX "ElectionObserverAssignment_electionId_expiresAt_idx" ON "ElectionObserverAssignment"("electionId", "expiresAt");

CREATE TABLE "ElectionScheduledEvent" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,

    CONSTRAINT "ElectionScheduledEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ElectionScheduledEvent_electionId_status_idx" ON "ElectionScheduledEvent"("electionId", "status");
CREATE INDEX "ElectionScheduledEvent_scheduledAt_status_idx" ON "ElectionScheduledEvent"("scheduledAt", "status");

CREATE TABLE "ElectionNotification" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "type" "ElectionNotificationType" NOT NULL,
    "channel" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectionNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ElectionNotification_electionId_type_idx" ON "ElectionNotification"("electionId", "type");
CREATE INDEX "ElectionNotification_scheduledAt_idx" ON "ElectionNotification"("scheduledAt");

CREATE TABLE "ElectionNotificationRecipient" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),

    CONSTRAINT "ElectionNotificationRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ElectionNotificationRecipient_notificationId_memberId_key" ON "ElectionNotificationRecipient"("notificationId", "memberId");
CREATE INDEX "ElectionNotificationRecipient_memberId_readAt_idx" ON "ElectionNotificationRecipient"("memberId", "readAt");

CREATE TABLE "ElectionSettingsSnapshot" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "settingsJson" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedById" TEXT NOT NULL,

    CONSTRAINT "ElectionSettingsSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ElectionSettingsSnapshot_electionId_capturedAt_idx" ON "ElectionSettingsSnapshot"("electionId", "capturedAt");

CREATE TABLE "ElectionIdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "memberId" TEXT,
    "requestHash" TEXT NOT NULL,
    "responseJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElectionIdempotencyKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ElectionIdempotencyKey_key_key" ON "ElectionIdempotencyKey"("key");
CREATE INDEX "ElectionIdempotencyKey_electionId_memberId_idx" ON "ElectionIdempotencyKey"("electionId", "memberId");
CREATE INDEX "ElectionIdempotencyKey_expiresAt_idx" ON "ElectionIdempotencyKey"("expiresAt");

-- Foreign keys
ALTER TABLE "Election" ADD CONSTRAINT "Election_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Election" ADD CONSTRAINT "Election_parentElectionId_fkey" FOREIGN KEY ("parentElectionId") REFERENCES "Election"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ElectionPosition" ADD CONSTRAINT "ElectionPosition_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ElectionEligibility" ADD CONSTRAINT "ElectionEligibility_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ElectionEligibility" ADD CONSTRAINT "ElectionEligibility_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ElectionEligibilityOverride" ADD CONSTRAINT "ElectionEligibilityOverride_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectionEligibilityOverride" ADD CONSTRAINT "ElectionEligibilityOverride_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectionEligibilityOverride" ADD CONSTRAINT "ElectionEligibilityOverride_overriddenById_fkey" FOREIGN KEY ("overriddenById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ElectionNomination" ADD CONSTRAINT "ElectionNomination_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ElectionNomination" ADD CONSTRAINT "ElectionNomination_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "ElectionPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ElectionNomination" ADD CONSTRAINT "ElectionNomination_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectionNomination" ADD CONSTRAINT "ElectionNomination_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ElectionCandidate" ADD CONSTRAINT "ElectionCandidate_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ElectionCandidate" ADD CONSTRAINT "ElectionCandidate_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "ElectionPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ElectionCandidate" ADD CONSTRAINT "ElectionCandidate_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectionCandidate" ADD CONSTRAINT "ElectionCandidate_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ElectionCandidate" ADD CONSTRAINT "ElectionCandidate_disqualifiedById_fkey" FOREIGN KEY ("disqualifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ElectionBallot" ADD CONSTRAINT "ElectionBallot_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BallotSelection" ADD CONSTRAINT "BallotSelection_ballotId_fkey" FOREIGN KEY ("ballotId") REFERENCES "ElectionBallot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BallotKeyRotation" ADD CONSTRAINT "BallotKeyRotation_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BallotKeyRotation" ADD CONSTRAINT "BallotKeyRotation_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ElectionParticipation" ADD CONSTRAINT "ElectionParticipation_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectionParticipation" ADD CONSTRAINT "ElectionParticipation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ElectionResult" ADD CONSTRAINT "ElectionResult_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectionResult" ADD CONSTRAINT "ElectionResult_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "ElectionPosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RecountRequest" ADD CONSTRAINT "RecountRequest_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecountRequest" ADD CONSTRAINT "RecountRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ElectionCommittee" ADD CONSTRAINT "ElectionCommittee_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ElectionCommitteeMember" ADD CONSTRAINT "ElectionCommitteeMember_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "ElectionCommittee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ElectionCommitteeMember" ADD CONSTRAINT "ElectionCommitteeMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ElectionCommitteeVacancy" ADD CONSTRAINT "ElectionCommitteeVacancy_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "ElectionCommittee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectionCommitteeVacancy" ADD CONSTRAINT "ElectionCommitteeVacancy_vacatedById_fkey" FOREIGN KEY ("vacatedById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectionCommitteeVacancy" ADD CONSTRAINT "ElectionCommitteeVacancy_filledById_fkey" FOREIGN KEY ("filledById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ElectionAuditLog" ADD CONSTRAINT "ElectionAuditLog_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ElectionObserverAssignment" ADD CONSTRAINT "ElectionObserverAssignment_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElectionObserverAssignment" ADD CONSTRAINT "ElectionObserverAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ElectionObserverAssignment" ADD CONSTRAINT "ElectionObserverAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ElectionScheduledEvent" ADD CONSTRAINT "ElectionScheduledEvent_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ElectionNotification" ADD CONSTRAINT "ElectionNotification_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ElectionNotificationRecipient" ADD CONSTRAINT "ElectionNotificationRecipient_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "ElectionNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ElectionNotificationRecipient" ADD CONSTRAINT "ElectionNotificationRecipient_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ElectionSettingsSnapshot" ADD CONSTRAINT "ElectionSettingsSnapshot_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ElectionSettingsSnapshot" ADD CONSTRAINT "ElectionSettingsSnapshot_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ElectionIdempotencyKey" ADD CONSTRAINT "ElectionIdempotencyKey_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add shortBio + displayOrder to ElectionCommitteeMember for landing-page integration.
ALTER TABLE "ElectionCommitteeMember" ADD COLUMN "shortBio" TEXT;
ALTER TABLE "ElectionCommitteeMember" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;
