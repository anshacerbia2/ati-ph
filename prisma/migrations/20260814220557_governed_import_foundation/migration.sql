-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('RAW_IMPORT', 'IMPORT_REPORT', 'OUTPUT_XLSX', 'EMAIL_PREVIEW', 'ERROR_REPORT', 'PROVIDER_EVENT');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('UPLOADED', 'VALIDATED', 'INVALID', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('VALID', 'INVALID', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "ValidationSeverity" AS ENUM ('ERROR', 'WARNING', 'INFO');

-- CreateTable
CREATE TABLE "file_artifacts" (
    "id" VARCHAR(191) NOT NULL,
    "artifactType" "ArtifactType" NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(150) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "storageProvider" VARCHAR(40) NOT NULL,
    "storageKey" VARCHAR(1000) NOT NULL,
    "retentionClass" VARCHAR(50) NOT NULL,
    "createdById" VARCHAR(191),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" VARCHAR(191) NOT NULL,
    "batchNumber" VARCHAR(50) NOT NULL,
    "sourceName" VARCHAR(200) NOT NULL,
    "schemaName" VARCHAR(100) NOT NULL,
    "schemaVersion" VARCHAR(30) NOT NULL,
    "rawArtifactId" VARCHAR(191) NOT NULL,
    "fileSha256" CHAR(64) NOT NULL,
    "columnMapping" JSONB NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'UPLOADED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" VARCHAR(191) NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "failureReason" TEXT,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" VARCHAR(191) NOT NULL,
    "importBatchId" VARCHAR(191) NOT NULL,
    "sourceSheet" VARCHAR(150) NOT NULL,
    "sourceRowNumber" INTEGER NOT NULL,
    "sourceRowId" VARCHAR(200),
    "rawData" JSONB NOT NULL,
    "normalizedData" JSONB NOT NULL,
    "status" "ImportRowStatus" NOT NULL,
    "warningAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "excludedReason" TEXT,
    "editedById" VARCHAR(191),
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_validation_issues" (
    "id" VARCHAR(191) NOT NULL,
    "importBatchId" VARCHAR(191) NOT NULL,
    "importRowId" VARCHAR(191),
    "severity" "ValidationSeverity" NOT NULL,
    "errorCode" VARCHAR(80) NOT NULL,
    "fieldName" VARCHAR(100),
    "rejectedValue" TEXT,
    "message" TEXT NOT NULL,
    "acknowledgedById" VARCHAR(191),
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_validation_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "file_artifacts_storageKey_key" ON "file_artifacts"("storageKey");

-- CreateIndex
CREATE INDEX "file_artifacts_sha256_idx" ON "file_artifacts"("sha256");

-- CreateIndex
CREATE INDEX "file_artifacts_artifactType_createdAt_idx" ON "file_artifacts"("artifactType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_batchNumber_key" ON "import_batches"("batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_rawArtifactId_key" ON "import_batches"("rawArtifactId");

-- CreateIndex
CREATE INDEX "import_batches_fileSha256_idx" ON "import_batches"("fileSha256");

-- CreateIndex
CREATE INDEX "import_batches_status_uploadedAt_idx" ON "import_batches"("status", "uploadedAt");

-- CreateIndex
CREATE INDEX "import_rows_importBatchId_status_idx" ON "import_rows"("importBatchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_importBatchId_sourceSheet_sourceRowNumber_key" ON "import_rows"("importBatchId", "sourceSheet", "sourceRowNumber");

-- CreateIndex
CREATE INDEX "import_validation_issues_importBatchId_severity_idx" ON "import_validation_issues"("importBatchId", "severity");

-- CreateIndex
CREATE INDEX "import_validation_issues_importRowId_idx" ON "import_validation_issues"("importRowId");

-- AddForeignKey
ALTER TABLE "file_artifacts" ADD CONSTRAINT "file_artifacts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_rawArtifactId_fkey" FOREIGN KEY ("rawArtifactId") REFERENCES "file_artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_validation_issues" ADD CONSTRAINT "import_validation_issues_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_validation_issues" ADD CONSTRAINT "import_validation_issues_importRowId_fkey" FOREIGN KEY ("importRowId") REFERENCES "import_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_validation_issues" ADD CONSTRAINT "import_validation_issues_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
