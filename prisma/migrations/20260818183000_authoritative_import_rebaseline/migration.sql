-- Fail closed any legacy batch that would otherwise be stranded when
-- asynchronous client-preview verification is retired.
UPDATE "import_batches"
SET
  "status" = 'FAILED',
  "failureReason" = COALESCE(
    "failureReason",
    'Legacy asynchronous import verification was retired during the authoritative server-parse rebaseline. Re-upload the workbook through the governed import flow.'
  )
WHERE
  "status" IN ('UPLOADED', 'VERIFYING')
  AND "verifiedAt" IS NULL;

DROP INDEX IF EXISTS "import_batches_status_verificationStartedAt_idx";

ALTER TABLE "import_batches"
RENAME COLUMN "verifiedAt" TO "validatedAt";

ALTER TABLE "import_batches"
DROP COLUMN "clientPreviewSha256",
DROP COLUMN "verificationStartedAt";

CREATE INDEX "import_batches_status_validatedAt_idx"
ON "import_batches"("status", "validatedAt");
