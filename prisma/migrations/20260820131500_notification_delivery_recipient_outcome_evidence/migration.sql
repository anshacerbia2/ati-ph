ALTER TABLE "notification"."notification_delivery_attempts"
ADD COLUMN "acceptedRecipients" JSONB,
ADD COLUMN "rejectedRecipients" JSONB;
