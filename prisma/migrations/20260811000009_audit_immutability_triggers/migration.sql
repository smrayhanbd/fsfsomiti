-- ============================================================================
-- Migration: audit_immutability_triggers (D19)
--
-- Installs a BEFORE UPDATE OR DELETE trigger on every audit-log table that
-- raises an exception if any UPDATE or DELETE is attempted. The application
-- layer already has no update / delete path for these tables (the docs
-- explicitly note "there is intentionally NO update / delete path in the
-- application" — see the TrustScoreHistory comment in schema.prisma), but
-- that's a soft guarantee: a buggy migration, a careless DBA, or a compromised
-- admin account could still mutate the audit trail. This trigger is the
-- database-level hard guarantee.
--
-- The trigger is idempotent: DROP IF EXISTS + CREATE so re-running the
-- migration (or re-applying after a partial rollback) replaces the trigger
-- rather than erroring out.
--
-- Tables protected (all append-only audit trails):
--   • TrustScoreHistory    — FRS score-change log
--   • SettingsAuditLog     — Mail/SMS settings change log
--   • TaskAuditLog         — Task activity timeline
--   • AuditLog             — RBAC role/permission change log
--   • EntityAuditLog       — Investment/Project activity log
--   • ElectionAuditLog     — Election lifecycle audit trail
-- ============================================================================

-- Step 1: Define the trigger function FIRST (must exist before triggers
--         that reference it are created).
CREATE OR REPLACE FUNCTION raise_audit_immutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit row immutable: % table forbids UPDATE and DELETE',
    TG_TABLE_NAME
    USING HINT = 'Audit rows are append-only. To correct an error, insert a new compensating row.';
END;
$$ LANGUAGE plpgsql;

-- Step 2: Install the trigger on every audit-log table. Idempotent —
--         DROP IF EXISTS first so re-running is safe.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'TrustScoreHistory',
    'SettingsAuditLog',
    'TaskAuditLog',
    'AuditLog',
    'EntityAuditLog',
    'ElectionAuditLog'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_immutable ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON %I ' ||
      'FOR EACH ROW EXECUTE FUNCTION raise_audit_immutable()', t
    );
  END LOOP;
END $$;
