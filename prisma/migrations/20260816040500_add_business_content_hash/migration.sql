-- Worker-authoritative semantic fingerprint of normalized Holiday_Master content.
ALTER TABLE "import_batches"
ADD COLUMN "businessContentSha256" CHAR(64);

CREATE INDEX "import_batches_businessContentSha256_idx"
ON "import_batches"("businessContentSha256");
