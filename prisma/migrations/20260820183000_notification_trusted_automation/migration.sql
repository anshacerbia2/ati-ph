CREATE TYPE "notification"."NotificationOperationalAlertType" AS ENUM ('PLANNING_BLOCKED', 'ZERO_RECIPIENT', 'SCHEDULER_LAG', 'DELIVERY_FAILURE');
CREATE TYPE "notification"."NotificationOperationalAlertSeverity" AS ENUM ('WARNING', 'CRITICAL');
CREATE TYPE "notification"."NotificationOperationalAlertStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "notification"."notification_operational_alerts" (
  "id" UUID NOT NULL,
  "alertKey" VARCHAR(191) NOT NULL,
  "type" "notification"."NotificationOperationalAlertType" NOT NULL,
  "severity" "notification"."NotificationOperationalAlertSeverity" NOT NULL,
  "status" "notification"."NotificationOperationalAlertStatus" NOT NULL DEFAULT 'OPEN',
  "holidayOccurrenceId" UUID,
  "notificationJobId" UUID,
  "summary" VARCHAR(500) NOT NULL,
  "details" JSONB,
  "firstDetectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastDetectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "notification_operational_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_operational_alerts_alert_key_key"
ON "notification"."notification_operational_alerts"("alertKey");

CREATE INDEX "notification_operational_alerts_status_severity_idx"
ON "notification"."notification_operational_alerts"("status", "severity", "lastDetectedAt");

CREATE INDEX "notification_operational_alerts_type_status_idx"
ON "notification"."notification_operational_alerts"("type", "status", "lastDetectedAt");

CREATE INDEX "notification_operational_alerts_occurrence_status_idx"
ON "notification"."notification_operational_alerts"("holidayOccurrenceId", "status");

CREATE INDEX "notification_operational_alerts_job_status_idx"
ON "notification"."notification_operational_alerts"("notificationJobId", "status");

CREATE TABLE "notification"."notification_worker_state" (
  "id" VARCHAR(40) NOT NULL,
  "trustedAutomationEnabled" BOOLEAN NOT NULL DEFAULT false,
  "lastCycleStartedAt" TIMESTAMPTZ(3),
  "lastCycleCompletedAt" TIMESTAMPTZ(3),
  "lastSuccessfulAt" TIMESTAMPTZ(3),
  "lastError" TEXT,
  "lastPlanningScanned" INTEGER NOT NULL DEFAULT 0,
  "lastPlanningReady" INTEGER NOT NULL DEFAULT 0,
  "lastPlanningCommitted" INTEGER NOT NULL DEFAULT 0,
  "lastPlanningBlocked" INTEGER NOT NULL DEFAULT 0,
  "lastDuePromoted" INTEGER NOT NULL DEFAULT 0,
  "lastDeliveryClaims" INTEGER NOT NULL DEFAULT 0,
  "lastOpenAlertCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "notification_worker_state_pkey" PRIMARY KEY ("id")
);
