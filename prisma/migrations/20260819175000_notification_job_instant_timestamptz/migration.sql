-- NotificationJob stores absolute instants. Prisma's PostgreSQL default DateTime
-- maps to timestamp(3) without time zone, which makes raw scheduler comparisons
-- depend on the PostgreSQL session TimeZone. Preserve existing values as UTC while
-- moving scheduler-relevant instants to timestamptz.

ALTER TABLE "notification"."notification_jobs"
  ALTER COLUMN "scheduledAt" TYPE TIMESTAMPTZ(3)
    USING "scheduledAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "dueAt" TYPE TIMESTAMPTZ(3)
    USING "dueAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3)
    USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3)
    USING "updatedAt" AT TIME ZONE 'UTC';
