-- MemberNotificationDismissal: tracks which computed portal notifications
-- a member has dismissed. Computed notifications (upcoming meetings,
-- outstanding dues, recently resolved requests) are live queries — they
-- don't live in MemberNotification, so "Mark all read" can't clear them.
-- This table records the stable notification ID so the portal bell can
-- filter them out until the underlying condition changes.

CREATE TABLE "MemberNotificationDismissal" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "notificationKey" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberNotificationDismissal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberNotificationDismissal_memberId_notificationKey_key" ON "MemberNotificationDismissal"("memberId", "notificationKey");
CREATE INDEX "MemberNotificationDismissal_memberId_idx" ON "MemberNotificationDismissal"("memberId");

ALTER TABLE "MemberNotificationDismissal" ADD CONSTRAINT "MemberNotificationDismissal_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
