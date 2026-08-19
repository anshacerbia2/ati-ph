BEGIN;

CREATE TYPE "notification"."NotificationJobStatus"
AS ENUM ('WAITING_APPROVAL', 'PLANNED', 'DUE', 'CANCELLED');

CREATE TABLE "notification"."notification_jobs" (
  "id" UUID NOT NULL,
  "idempotencyKey" CHAR(64) NOT NULL,
  "holidayOccurrenceId" UUID NOT NULL,
  "clientSubscriptionId" UUID NOT NULL,
  "notificationPolicyVersionId" UUID NOT NULL,
  "notificationSchedulePolicyVersionId" UUID,
  "scheduleSource" "notification"."NotificationScheduleSource" NOT NULL,
  "scheduleSourceVersion" INTEGER NOT NULL,
  "targetHolidayDate" DATE NOT NULL,
  "plannedLocalDate" DATE NOT NULL,
  "plannedLocalTime" VARCHAR(5) NOT NULL,
  "timezone" VARCHAR(100) NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "approvalMode" "notification"."NotificationApprovalMode" NOT NULL,
  "status" "notification"."NotificationJobStatus" NOT NULL,
  "recipientSnapshot" JSONB NOT NULL,
  "ruleSnapshot" JSONB NOT NULL,
  "automaticSendAllowed" BOOLEAN NOT NULL DEFAULT false,
  "retryCeiling" INTEGER,
  "dueAt" TIMESTAMP(3),
  "committedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_jobs_idempotency_key_key"
ON "notification"."notification_jobs"("idempotencyKey");

CREATE INDEX "notification_jobs_status_scheduled_at_idx"
ON "notification"."notification_jobs"("status", "scheduledAt");

CREATE INDEX "notification_jobs_occurrence_created_at_idx"
ON "notification"."notification_jobs"("holidayOccurrenceId", "createdAt");

CREATE INDEX "notification_jobs_subscription_scheduled_at_idx"
ON "notification"."notification_jobs"("clientSubscriptionId", "scheduledAt");

CREATE INDEX "notification_jobs_policy_version_idx"
ON "notification"."notification_jobs"("notificationPolicyVersionId");

CREATE INDEX "notification_jobs_schedule_version_idx"
ON "notification"."notification_jobs"("notificationSchedulePolicyVersionId");

ALTER TABLE "notification"."notification_jobs"
ADD CONSTRAINT "notification_jobs_occurrence_fkey"
FOREIGN KEY ("holidayOccurrenceId")
REFERENCES "holiday"."holiday_occurrences"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification"."notification_jobs"
ADD CONSTRAINT "notification_jobs_subscription_fkey"
FOREIGN KEY ("clientSubscriptionId")
REFERENCES "routing"."client_subscriptions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification"."notification_jobs"
ADD CONSTRAINT "notification_jobs_policy_version_fkey"
FOREIGN KEY ("notificationPolicyVersionId")
REFERENCES "notification"."notification_policy_versions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification"."notification_jobs"
ADD CONSTRAINT "notification_jobs_schedule_version_fkey"
FOREIGN KEY ("notificationSchedulePolicyVersionId")
REFERENCES "notification"."notification_schedule_policy_versions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification"."notification_jobs"
ADD CONSTRAINT "notification_jobs_committed_by_fkey"
FOREIGN KEY ("committedById")
REFERENCES "access"."users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
