CREATE TYPE "notification"."NotificationDeliveryReconciliationAction" AS ENUM ('MARK_SENT', 'RETRY', 'FAIL');

ALTER TABLE "notification"."notification_delivery_attempts"
ADD COLUMN "reconciliationAction" "notification"."NotificationDeliveryReconciliationAction",
ADD COLUMN "reconciliationNote" TEXT,
ADD COLUMN "reconciledAt" TIMESTAMPTZ(3),
ADD COLUMN "reconciledById" UUID;

ALTER TABLE "notification"."notification_delivery_attempts"
ADD CONSTRAINT "notification_delivery_attempts_reconciled_by_fkey"
FOREIGN KEY ("reconciledById") REFERENCES "access"."users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "notification_delivery_attempts_reconciliation_idx"
ON "notification"."notification_delivery_attempts"("failureClass", "reconciliationAction", "completedAt");
