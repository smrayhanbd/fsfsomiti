-- Add tsvector column for full-text search on members.
-- The trigger keeps it in sync on INSERT / UPDATE so we never have to backfill
-- outside of this migration.
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "searchVector" tsvector;

-- Populate it from the searchable identity fields. NULLIF-ing each segment to
-- '' keeps concatenated nulls from producing "  " (which would index as a
-- single keyword). The final coalesce guarantees a non-null source string.
UPDATE "Member" SET "searchVector" =
  to_tsvector('english',
    coalesce("firstName", '') || ' ' ||
    coalesce("lastName",  '') || ' ' ||
    coalesce("memberNo",   '') || ' ' ||
    coalesce("phone",      '') || ' ' ||
    coalesce("nidNumber",  '') || ' ' ||
    coalesce("email",      '')
  );

-- GIN index — required for `WHERE "searchVector" @@ plainto_tsquery(...)` to
-- be index-backed rather than seq-scan-backed.
CREATE INDEX IF NOT EXISTS "Member_searchVector_idx"
  ON "Member" USING GIN ("searchVector");

-- Trigger function — recomputes the tsvector on every insert/update.
CREATE OR REPLACE FUNCTION member_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" := to_tsvector('english',
    coalesce(NEW."firstName", '') || ' ' ||
    coalesce(NEW."lastName",  '') || ' ' ||
    coalesce(NEW."memberNo",   '') || ' ' ||
    coalesce(NEW."phone",      '') || ' ' ||
    coalesce(NEW."nidNumber",  '') || ' ' ||
    coalesce(NEW."email",      '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS member_search_vector_trigger ON "Member";
CREATE TRIGGER member_search_vector_trigger
  BEFORE INSERT OR UPDATE ON "Member"
  FOR EACH ROW EXECUTE FUNCTION member_search_vector_update();
