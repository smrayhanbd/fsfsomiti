-- Cloud Backup: history of every database snapshot taken from the admin UI.
-- Backs the System & Settings -> Cloud Backup page. Each row records a single
-- JSON dump of every Prisma table; the dump itself lives on disk under
-- `BACKUP_STORAGE_DIR` (default: ./backups) and is served back through the
-- /api/backup/[id]/download route.
--
-- Status transitions:
--   PENDING -> IN_PROGRESS -> SUCCESS   (happy path)
--                       \-> FAILED     (any thrown error during dump)
--
-- NOTE: the dev database is applied via `prisma db push`; this file records
-- the change for environments that run migrations cleanly.
CREATE TABLE "Backup" (
    "id"            TEXT            NOT NULL,
    "filename"      TEXT            NOT NULL,
    "filePath"      TEXT            NOT NULL,
    "sizeBytes"     BIGINT          NOT NULL DEFAULT 0,
    "tableCounts"   JSONB           NOT NULL DEFAULT '{}',
    "tableCount"    INTEGER         NOT NULL DEFAULT 0,
    "trigger"       TEXT            NOT NULL DEFAULT 'manual',
    "status"        TEXT            NOT NULL DEFAULT 'PENDING',
    "error"         TEXT,
    "checksum"      TEXT,
    "createdById"   TEXT,
    "createdByName" TEXT,
    "createdAt"     TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt"    TIMESTAMP(3),

    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Backup_createdAt_idx" ON "Backup" ("createdAt" DESC);
CREATE INDEX "Backup_status_idx"    ON "Backup" ("status");
