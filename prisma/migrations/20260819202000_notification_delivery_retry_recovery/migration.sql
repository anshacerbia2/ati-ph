-- Delivery retry/recovery is additive and preserves existing jobs/attempts.
-- retryCeiling semantics: number of retries after the initial attempt.
-- Lease expiry is automatically retryable only when the durable attempt
-- explicitly records leaseRetrySafe=true. This prevents duplicate external
-- delivery when a worker crashes after a provider may already have accepted
-- a message.

ALTER TYPE "notification"."NotificationJobStatus"
  ADD VALUE IF NOT EXISTS 'RETRY_WAIT';

CREATE TYPE "notification"."NotificationDeliveryFailureClass"
AS ENUM ('RETRYABLE', 'TERMINAL', 'OUTCOME_UNKNOWN');

ALTER TABLE "notification"."notification_jobs"
  ADD COLUMN "retryAt" TIMESTAMPTZ(3);

ALTER TABLE "notification"."notification_delivery_attempts"
  ADD COLUMN "failureClass"
    "notification"."NotificationDeliveryFailureClass",
  ADD COLUMN "leaseRetrySafe" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX
  "notification_jobs_status_retry_at_idx"
ON "notification"."notification_jobs"
  ("status", "retryAt");
