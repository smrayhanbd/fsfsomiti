-- ============================================================================
-- Migration: message_delivery_log (Roadmap item 19)
--
-- Persistent outbox for SMS / Email messages. Backs the retry-with-back-off
-- worker: failed rows are retried up to maxAttempts times, with nextRetryAt
-- scheduling the next attempt.
-- ============================================================================

CREATE TABLE "MessageDeliveryLog" (
    "id"              TEXT         NOT NULL,
    "channel"         TEXT         NOT NULL,
    "recipient"       TEXT         NOT NULL,
    "body"            TEXT         NOT NULL,
    "status"          TEXT         NOT NULL DEFAULT 'PENDING',
    "gatewayResponse" TEXT,
    "attemptCount"    INTEGER      NOT NULL DEFAULT 0,
    "maxAttempts"     INTEGER      NOT NULL DEFAULT 3,
    "nextRetryAt"     TIMESTAMP(3),
    "lastError"       TEXT,
    "relatedType"     TEXT,
    "relatedId"       TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageDeliveryLog_pkey" PRIMARY KEY ("id")
);

-- The retry-worker's main query: SELECT ... WHERE status IN ('PENDING','RETRYING')
-- AND (nextRetryAt IS NULL OR nextRetryAt <= NOW()) ORDER BY nextRetryAt;
CREATE INDEX IF NOT EXISTS "MessageDeliveryLog_status_nextRetryAt_idx"
  ON "MessageDeliveryLog"("status", "nextRetryAt");

-- The per-recipient history query: "show me every message we sent to this
-- phone/email, newest first."
CREATE INDEX IF NOT EXISTS "MessageDeliveryLog_recipient_createdAt_idx"
  ON "MessageDeliveryLog"("recipient", "createdAt");
