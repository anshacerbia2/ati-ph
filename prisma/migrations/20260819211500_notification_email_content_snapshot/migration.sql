-- Freeze rendered governed email content on each notification job.
-- Existing committed jobs intentionally remain NULL and are not backfilled:
-- they predate this content contract and must not silently inherit a newer
-- template at execution time.

ALTER TABLE "notification"."notification_jobs"
  ADD COLUMN "contentSnapshot" JSONB,
  ADD COLUMN "contentSha256" CHAR(64);
