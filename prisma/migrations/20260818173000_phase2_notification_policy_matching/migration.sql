-- CreateEnum
CREATE TYPE "HolidayDayFilter" AS ENUM ('WEEKDAY', 'WEEKEND', 'ALL');
CREATE TYPE "NotificationLeadTimeMode" AS ENUM ('CALENDAR_DAY', 'BUSINESS_DAY');
CREATE TYPE "NotificationWeekendAdjustment" AS ENUM ('UNCONFIRMED', 'NONE', 'PREVIOUS_BUSINESS_DAY', 'NEXT_BUSINESS_DAY');
CREATE TYPE "NotificationBusinessDayHolidayMode" AS ENUM ('UNCONFIRMED', 'EXCLUDE_PUBLIC_HOLIDAYS', 'IGNORE_PUBLIC_HOLIDAYS');
CREATE TYPE "NotificationApprovalMode" AS ENUM ('UNCONFIRMED', 'REQUIRED', 'NOT_REQUIRED');

-- CreateTable
CREATE TABLE "notification_policies" (
    "id" UUID NOT NULL,
    "clientSubscriptionId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notification_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_policy_versions" (
    "id" UUID NOT NULL,
    "notificationPolicyId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "holidayDayFilter" "HolidayDayFilter" NOT NULL,
    "leadTimeValue" INTEGER,
    "leadTimeMode" "NotificationLeadTimeMode",
    "sendTimeLocal" VARCHAR(5),
    "timezone" VARCHAR(100),
    "weekendAdjustment" "NotificationWeekendAdjustment" NOT NULL DEFAULT 'UNCONFIRMED',
    "businessDayHolidayMode" "NotificationBusinessDayHolidayMode" NOT NULL DEFAULT 'UNCONFIRMED',
    "approvalMode" "NotificationApprovalMode" NOT NULL DEFAULT 'UNCONFIRMED',
    "automaticSendAllowed" BOOLEAN NOT NULL DEFAULT false,
    "retryCeiling" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "changeReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_policy_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_policies_clientSubscriptionId_key" ON "notification_policies"("clientSubscriptionId");
CREATE INDEX "notification_policies_isActive_createdAt_idx" ON "notification_policies"("isActive", "createdAt");
CREATE UNIQUE INDEX "notification_policy_versions_notificationPolicyId_version_key" ON "notification_policy_versions"("notificationPolicyId", "version");
CREATE INDEX "notification_policy_versions_notificationPolicyId_isActive_idx" ON "notification_policy_versions"("notificationPolicyId", "isActive");
CREATE UNIQUE INDEX "notification_policy_versions_one_active_per_policy_idx" ON "notification_policy_versions"("notificationPolicyId") WHERE "isActive" = true;

ALTER TABLE "notification_policies" ADD CONSTRAINT "notification_policies_clientSubscriptionId_fkey" FOREIGN KEY ("clientSubscriptionId") REFERENCES "client_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_policy_versions" ADD CONSTRAINT "notification_policy_versions_notificationPolicyId_fkey" FOREIGN KEY ("notificationPolicyId") REFERENCES "notification_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
