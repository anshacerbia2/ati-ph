-- Notification approval reuses the generic approval.approval_requests table.
-- This migration establishes the durable delivery execution contract only.
-- No provider/SMTP integration is introduced here.

ALTER TYPE "notification"."NotificationJobStatus"
  ADD VALUE IF NOT EXISTS 'PROCESSING';

ALTER TYPE "notification"."NotificationJobStatus"
  ADD VALUE IF NOT EXISTS 'SENT';

ALTER TYPE "notification"."NotificationJobStatus"
  ADD VALUE IF NOT EXISTS 'FAILED';

CREATE TYPE "notification"."NotificationDeliveryAttemptStatus"
AS ENUM ('CLAIMED', 'SENT', 'FAILED');

ALTER TABLE "notification"."notification_jobs"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sentAt" TIMESTAMPTZ(3),
  ADD COLUMN "failedAt" TIMESTAMPTZ(3),
  ADD COLUMN "lastError" TEXT;

CREATE TABLE "notification"."notification_delivery_attempts" (
  "id" UUID NOT NULL,
  "notificationJobId" UUID NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "status" "notification"."NotificationDeliveryAttemptStatus" NOT NULL,
  "claimedAt" TIMESTAMPTZ(3) NOT NULL,
  "leaseExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  "completedAt" TIMESTAMPTZ(3),
  "provider" VARCHAR(100),
  "providerMessageId" VARCHAR(500),
  "errorCode" VARCHAR(120),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_delivery_attempts_pkey"
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX
  "notification_delivery_attempts_job_attempt_key"
ON "notification"."notification_delivery_attempts"
  ("notificationJobId", "attemptNumber");

CREATE INDEX
  "notification_delivery_attempts_status_lease_idx"
ON "notification"."notification_delivery_attempts"
  ("status", "leaseExpiresAt");

ALTER TABLE "notification"."notification_delivery_attempts"
ADD CONSTRAINT
  "notification_delivery_attempts_job_fkey"
FOREIGN KEY ("notificationJobId")
REFERENCES "notification"."notification_jobs"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
