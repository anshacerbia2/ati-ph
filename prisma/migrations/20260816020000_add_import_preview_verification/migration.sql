-- Browser preview remains advisory until the raw workbook is verified asynchronously.
ALTER TYPE "ImportBatchStatus"
ADD VALUE 'VERIFYING';

ALTER TABLE "import_batches"
ADD COLUMN "clientPreviewSha256" CHAR(64),
ADD COLUMN "verificationStartedAt" TIMESTAMP(3),
ADD COLUMN "verifiedAt" TIMESTAMP(3);

CREATE INDEX "import_batches_status_verificationStartedAt_idx"
ON "import_batches"("status", "verificationStartedAt");
