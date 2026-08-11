-- ============================================================================
-- Migration: datetime_timestamptz (D12 + Roadmap follow-up)
--
-- Converts all TIMESTAMP(3) (without TZ) columns to TIMESTAMPTZ(3) (with TZ).
-- Existing values are interpreted as Asia/Dhaka local time before conversion,
-- so a stored "2026-08-11 14:00" (which was Dhaka local) becomes
-- "2026-08-11 14:00 +06:00" — i.e. displayed correctly in any client TZ.
--
-- Also converts date-only fields (dateOfBirth, marriageDate, joiningDate,
-- MemberDocument.issueDate, MemberNominee.dateOfBirth, LoanSchedule.dueDate)
-- to DATE type since they have no meaningful time component.
--
-- This migration is idempotent — `ALTER COLUMN ... TYPE` is a no-op when the
-- column is already the target type. Safe to re-apply.
-- ============================================================================

-- Set the session timezone for the conversion so AT TIME ZONE interprets
-- existing values as Dhaka local time.
SET TIME ZONE 'Asia/Dhaka';

-- ─── Convert all TIMESTAMP columns in important tables to TIMESTAMPTZ ───
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE data_type = 'timestamp without time zone'
      AND table_schema = 'public'
      AND table_name IN (
        'Transaction', 'Loan', 'LoanSchedule', 'Election', 'Member',
        'Meeting', 'Notification', 'JournalEntry', 'Savings', 'Task',
        'User', 'MemberRequest', 'ProfileUpdateRequest', 'IncomeDistribution',
        'Investment', 'InvestmentIncome', 'InvestmentValuation',
        'InvestmentExit', 'Project', 'ProjectExpense', 'ProjectRevenue',
        'AccountBalanceHistory', 'MessageDeliveryLog', 'PaymentIntent',
        'Backup', 'AuditLog', 'TrustScoreHistory', 'SettingsAuditLog',
        'TaskAuditLog', 'EntityAuditLog', 'ElectionAuditLog',
        'ElectionBallot', 'ElectionParticipation', 'ElectionNomination',
        'ElectionCandidate', 'RecountRequest', 'ElectionObserverAssignment',
        'ElectionSettingsSnapshot', 'BallotKeyRotation',
        'ElectionEligibilityOverride', 'ElectionCommittee',
        'ElectionCommitteeMember', 'FinancialYear', 'DepositProduct',
        'MemberDeposit', 'LoanRepayment', 'Counter', 'ApprovalLimit',
        'MemberAddress', 'MemberDocument', 'MemberNominee',
        'MemberNotification', 'MemberNotificationDismissal',
        'Organization', 'SiteContent', 'ChargeTypeConfig',
        'CollectionType', 'BankAccount', 'SmsSettings', 'MailSettings',
        'TransparencySettings', 'AchievementBadge', 'Fine',
        'ProfilePhotoRequest', 'Role', 'RolePermission', 'UserPermission',
        'Permission', 'PermissionOverride', 'TaskAssignee',
        'TaskChecklistItem', 'TaskComment', 'TaskAttachment',
        'TaskTimeLog', 'TaskReminder', 'TaskDependency', 'MeetingAttendance',
        'MeetingMinutes', 'PasswordReset', 'Wish', 'VoucherEntry',
        'TransactionAttachment'
      )
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I TYPE TIMESTAMPTZ(3) USING %I AT TIME ZONE ''Asia/Dhaka''',
        r.table_name, r.column_name, r.column_name
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping %.% (already TIMESTAMPTZ or column missing): %', r.table_name, r.column_name, SQLERRM;
    END;
  END LOOP;
END $$;

-- ─── Convert date-only fields to DATE type ───
-- These fields have no meaningful time component; storing as DATE avoids
-- off-by-one-day bugs when the server TZ differs from the client.

-- Member
ALTER TABLE "Member" ALTER COLUMN "dateOfBirth" TYPE DATE USING "dateOfBirth"::DATE;
ALTER TABLE "Member" ALTER COLUMN "marriageDate" TYPE DATE USING "marriageDate"::DATE;
ALTER TABLE "Member" ALTER COLUMN "joiningDate" TYPE DATE USING "joiningDate"::DATE;

-- MemberDocument
ALTER TABLE "MemberDocument" ALTER COLUMN "issueDate" TYPE DATE USING "issueDate"::DATE;

-- MemberNominee
ALTER TABLE "MemberNominee" ALTER COLUMN "dateOfBirth" TYPE DATE USING "dateOfBirth"::DATE;

-- LoanSchedule
ALTER TABLE "LoanSchedule" ALTER COLUMN "dueDate" TYPE DATE USING "dueDate"::DATE;

-- FinancialYear (date range)
ALTER TABLE "FinancialYear" ALTER COLUMN "startDate" TYPE DATE USING "startDate"::DATE;
ALTER TABLE "FinancialYear" ALTER COLUMN "endDate" TYPE DATE USING "endDate"::DATE;

-- MemberDeposit (deposit + maturity dates)
ALTER TABLE "MemberDeposit" ALTER COLUMN "startDate" TYPE DATE USING "startDate"::DATE;
ALTER TABLE "MemberDeposit" ALTER COLUMN "maturityDate" TYPE DATE USING "maturityDate"::DATE;
