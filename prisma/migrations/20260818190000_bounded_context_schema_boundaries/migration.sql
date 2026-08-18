BEGIN;

-- Bounded-context namespaces. This remains one PostgreSQL database.
CREATE SCHEMA IF NOT EXISTS "access";
CREATE SCHEMA IF NOT EXISTS "approval";
CREATE SCHEMA IF NOT EXISTS "governance";
CREATE SCHEMA IF NOT EXISTS "holiday";
CREATE SCHEMA IF NOT EXISTS "import";
CREATE SCHEMA IF NOT EXISTS "notification";
CREATE SCHEMA IF NOT EXISTS "routing";

-- Move native enum types without recreating them.
ALTER TYPE "public"."OutboxStatus" SET SCHEMA "governance";
ALTER TYPE "public"."ArtifactType" SET SCHEMA "governance";
ALTER TYPE "public"."ImportBatchStatus" SET SCHEMA "import";
ALTER TYPE "public"."ImportRowStatus" SET SCHEMA "import";
ALTER TYPE "public"."ValidationSeverity" SET SCHEMA "import";
ALTER TYPE "public"."ApprovalStatus" SET SCHEMA "approval";
ALTER TYPE "public"."SubscriptionRecipientType" SET SCHEMA "routing";
ALTER TYPE "public"."HolidayDayFilter" SET SCHEMA "notification";
ALTER TYPE "public"."NotificationLeadTimeMode" SET SCHEMA "notification";
ALTER TYPE "public"."NotificationWeekendAdjustment" SET SCHEMA "notification";
ALTER TYPE "public"."NotificationBusinessDayHolidayMode" SET SCHEMA "notification";
ALTER TYPE "public"."NotificationApprovalMode" SET SCHEMA "notification";

-- Move existing tables in place. PostgreSQL preserves rows, constraints,
-- indexes, owned sequences, and foreign-key dependencies.
ALTER TABLE "public"."users" SET SCHEMA "access";
ALTER TABLE "public"."auth_sessions" SET SCHEMA "access";
ALTER TABLE "public"."roles" SET SCHEMA "access";
ALTER TABLE "public"."permissions" SET SCHEMA "access";
ALTER TABLE "public"."role_permissions" SET SCHEMA "access";
ALTER TABLE "public"."user_roles" SET SCHEMA "access";
ALTER TABLE "public"."menus" SET SCHEMA "access";
ALTER TABLE "public"."audit_events" SET SCHEMA "governance";
ALTER TABLE "public"."outbox_events" SET SCHEMA "governance";
ALTER TABLE "public"."file_artifacts" SET SCHEMA "governance";
ALTER TABLE "public"."import_batches" SET SCHEMA "import";
ALTER TABLE "public"."import_rows" SET SCHEMA "import";
ALTER TABLE "public"."import_validation_issues" SET SCHEMA "import";
ALTER TABLE "public"."approval_requests" SET SCHEMA "approval";
ALTER TABLE "public"."calendar_regions" SET SCHEMA "holiday";
ALTER TABLE "public"."calendar_region_aliases" SET SCHEMA "holiday";
ALTER TABLE "public"."holiday_definitions" SET SCHEMA "holiday";
ALTER TABLE "public"."holiday_occurrences" SET SCHEMA "holiday";
ALTER TABLE "public"."holiday_occurrence_regions" SET SCHEMA "holiday";
ALTER TABLE "public"."holiday_occurrence_dates" SET SCHEMA "holiday";
ALTER TABLE "public"."clients" SET SCHEMA "routing";
ALTER TABLE "public"."service_teams" SET SCHEMA "routing";
ALTER TABLE "public"."contacts" SET SCHEMA "routing";
ALTER TABLE "public"."client_subscriptions" SET SCHEMA "routing";
ALTER TABLE "public"."subscription_recipients" SET SCHEMA "routing";
ALTER TABLE "public"."notification_policies" SET SCHEMA "notification";
ALTER TABLE "public"."notification_policy_versions" SET SCHEMA "notification";

COMMIT;
