BEGIN;

ALTER TABLE "routing"."client_subscriptions"
ADD COLUMN "legacyClientMasterTag" VARCHAR(32);

UPDATE "routing"."client_subscriptions" AS subscription
SET "legacyClientMasterTag" = CASE version."holidayDayFilter"
  WHEN 'WEEKDAY'::"notification"."HolidayDayFilter" THEN 'Weekdays'
  WHEN 'WEEKEND'::"notification"."HolidayDayFilter" THEN 'Weekend'
  ELSE NULL
END
FROM "notification"."notification_policies" AS policy
JOIN "notification"."notification_policy_versions" AS version
  ON version."notificationPolicyId" = policy."id"
WHERE policy."clientSubscriptionId" = subscription."id"
  AND version."version" = 1
  AND version."changeReason" = 'Migrated from Client_Master.Tag'
  AND subscription."legacyClientMasterTag" IS NULL;

DO $$
DECLARE
  legacy_version RECORD;
  next_version INTEGER;
  corrected_id UUID;
  legacy_tag TEXT;
BEGIN
  FOR legacy_version IN
    SELECT version.*
    FROM "notification"."notification_policy_versions" AS version
    WHERE version."version" = 1
      AND version."isActive" = true
      AND version."changeReason" = 'Migrated from Client_Master.Tag'
  LOOP
    SELECT COALESCE(MAX(candidate."version"), 0) + 1
    INTO next_version
    FROM "notification"."notification_policy_versions" AS candidate
    WHERE candidate."notificationPolicyId" = legacy_version."notificationPolicyId";

    legacy_tag := CASE legacy_version."holidayDayFilter"
      WHEN 'WEEKDAY'::"notification"."HolidayDayFilter" THEN 'Weekdays'
      WHEN 'WEEKEND'::"notification"."HolidayDayFilter" THEN 'Weekend'
      ELSE 'Unknown'
    END;

    UPDATE "notification"."notification_policy_versions"
    SET "isActive" = false
    WHERE "id" = legacy_version."id";

    corrected_id :=
      md5(
        legacy_version."notificationPolicyId"::text
        || ':client-master-routing-rebaseline:'
        || next_version::text
      )::uuid;

    INSERT INTO "notification"."notification_policy_versions" (
      "id",
      "notificationPolicyId",
      "version",
      "holidayDayFilter",
      "leadTimeValue",
      "leadTimeMode",
      "sendTimeLocal",
      "timezone",
      "weekendAdjustment",
      "businessDayHolidayMode",
      "approvalMode",
      "automaticSendAllowed",
      "retryCeiling",
      "isActive",
      "changeReason",
      "createdAt"
    )
    VALUES (
      corrected_id,
      legacy_version."notificationPolicyId",
      next_version,
      'ALL'::"notification"."HolidayDayFilter",
      legacy_version."leadTimeValue",
      legacy_version."leadTimeMode",
      legacy_version."sendTimeLocal",
      legacy_version."timezone",
      legacy_version."weekendAdjustment",
      legacy_version."businessDayHolidayMode",
      legacy_version."approvalMode",
      false,
      legacy_version."retryCeiling",
      true,
      'Rebaseline: Client_Master.Tag=' || legacy_tag
        || ' is preserved as legacy evidence and is not matching authority until semantics are confirmed.',
      CURRENT_TIMESTAMP
    );
  END LOOP;
END
$$;

COMMIT;
