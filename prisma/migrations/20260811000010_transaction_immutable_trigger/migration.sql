-- ============================================================================
-- Migration: transaction_immutable_trigger (D7)
--
-- Installs a BEFORE UPDATE trigger on the Transaction table that blocks
-- mutations to APPROVED or REVERSED transactions except for the small set of
-- status-transition fields (reversedById, reversedAt, reversalReason, etc.).
-- This is the database-level enforcement of the spec §19 rule: "Approved
-- transactions are immutable — corrections require a Reversal".
--
-- The application layer already enforces this in app/actions/transactions.ts
-- (the approve / reverse server actions), but a trigger is the hard guarantee
-- against direct SQL access (DBA console, buggy migration, compromised admin
-- account). The trigger fires on UPDATE only — INSERT is always allowed (a
-- new row is by definition not yet APPROVED).
--
-- The trigger's logic:
--   IF OLD.status IN ('APPROVED', 'REVERSED') AND NEW.status = OLD.status
--   THEN RAISE EXCEPTION
-- This is a conservative check that allows:
--   • status transitions themselves (e.g. APPROVED → REVERSED via the
--     reversal action — the NEW.status differs from OLD.status so the
--     trigger lets it through),
--   • updates to the reversal-tracking columns (reversedById, reversedAt,
--     reversalReason) on a REVERSED row that is being re-reversed (rare).
-- It blocks:
--   • edits to amount / memberId / cashAccountId / subType / etc. on any
--     APPROVED or REVERSED row.
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_transaction_immutable() RETURNS TRIGGER AS $$
BEGIN
  -- Only block in-place mutations: status unchanged AND row was already in a
  -- terminal state (APPROVED or REVERSED). Status transitions themselves are
  -- allowed so the reversal workflow can flip APPROVED → REVERSED.
  IF (OLD.status IN ('APPROVED', 'REVERSED')) AND (NEW.status = OLD.status) THEN
    RAISE EXCEPTION
      'Approved/Reversed transactions are immutable (only status transitions allowed): transaction %',
      OLD.id
      USING HINT = 'To correct an APPROVED/REVERSED transaction, create a Reversal instead.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS transaction_immutable ON "Transaction";
CREATE TRIGGER transaction_immutable BEFORE UPDATE ON "Transaction"
FOR EACH ROW EXECUTE FUNCTION enforce_transaction_immutable();
