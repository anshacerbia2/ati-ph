BEGIN;

CREATE TYPE "notification"."NotificationScheduleSource"
AS ENUM ('GLOBAL', 'CLIENT_OVERRIDE');

ALTER TABLE "notification"."notification_policy_versions"
ADD COLUMN "scheduleSource" "notification"."NotificationScheduleSource"
NOT NULL DEFAULT 'GLOBAL';

CREATE TABLE "notification"."notification_schedule_policies" (
  "id" UUID NOT NULL,
  "scopeKey" VARCHAR(40) NOT NULL DEFAULT 'GLOBAL',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_schedule_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification"."notification_schedule_policy_versions" (
  "id" UUID NOT NULL,
  "notificationSchedulePolicyId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "leadTimeValue" INTEGER,
  "leadTimeMode" "notification"."NotificationLeadTimeMode",
  "sendTimeLocal" VARCHAR(5),
  "timezone" VARCHAR(100),
  "weekendAdjustment" "notification"."NotificationWeekendAdjustment"
    NOT NULL DEFAULT 'UNCONFIRMED',
  "businessDayHolidayMode" "notification"."NotificationBusinessDayHolidayMode"
    NOT NULL DEFAULT 'UNCONFIRMED',
  "approvalMode" "notification"."NotificationApprovalMode"
    NOT NULL DEFAULT 'UNCONFIRMED',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "changeReason" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_schedule_policy_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_schedule_policies_scopeKey_key"
ON "notification"."notification_schedule_policies"("scopeKey");

CREATE INDEX "notification_schedule_policies_isActive_createdAt_idx"
ON "notification"."notification_schedule_policies"("isActive", "createdAt");

CREATE UNIQUE INDEX "notification_schedule_policy_versions_policy_version_key"
ON "notification"."notification_schedule_policy_versions"(
  "notificationSchedulePolicyId",
  "version"
);

CREATE INDEX "notification_schedule_policy_versions_policy_active_idx"
ON "notification"."notification_schedule_policy_versions"(
  "notificationSchedulePolicyId",
  "isActive"
);

CREATE UNIQUE INDEX "notification_schedule_policy_versions_one_active_idx"
ON "notification"."notification_schedule_policy_versions"(
  "notificationSchedulePolicyId"
)
WHERE "isActive" = true;

ALTER TABLE "notification"."notification_schedule_policy_versions"
ADD CONSTRAINT "notification_schedule_policy_versions_policy_fkey"
FOREIGN KEY ("notificationSchedulePolicyId")
REFERENCES "notification"."notification_schedule_policies"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "notification"."notification_schedule_policies" (
  "id",
  "scopeKey",
  "isActive",
  "createdAt",
  "updatedAt"
)
VALUES (
  md5('ati-ph:notification-schedule:global')::uuid,
  'GLOBAL',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("scopeKey") DO NOTHING;

INSERT INTO "notification"."notification_schedule_policy_versions" (
  "id",
  "notificationSchedulePolicyId",
  "version",
  "leadTimeValue",
  "leadTimeMode",
  "sendTimeLocal",
  "timezone",
  "weekendAdjustment",
  "businessDayHolidayMode",
  "approvalMode",
  "isActive",
  "changeReason",
  "createdAt"
)
SELECT
  md5('ati-ph:notification-schedule:global:v1')::uuid,
  policy."id",
  1,
  NULL,
  NULL,
  NULL,
  NULL,
  'UNCONFIRMED'::"notification"."NotificationWeekendAdjustment",
  'UNCONFIRMED'::"notification"."NotificationBusinessDayHolidayMode",
  'UNCONFIRMED'::"notification"."NotificationApprovalMode",
  true,
  'Initial global schedule baseline; business timing remains unconfirmed.',
  CURRENT_TIMESTAMP
FROM "notification"."notification_schedule_policies" AS policy
WHERE policy."scopeKey" = 'GLOBAL'
  AND NOT EXISTS (
    SELECT 1
    FROM "notification"."notification_schedule_policy_versions" AS version
    WHERE version."notificationSchedulePolicyId" = policy."id"
  );

COMMIT;
