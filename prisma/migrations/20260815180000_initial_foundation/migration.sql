CREATE SCHEMA IF NOT EXISTS "identity";
CREATE SCHEMA IF NOT EXISTS "artifact";
CREATE SCHEMA IF NOT EXISTS "ingestion";
CREATE SCHEMA IF NOT EXISTS "audit";
CREATE SCHEMA IF NOT EXISTS "execution";
CREATE SCHEMA IF NOT EXISTS "holiday";

CREATE TYPE "identity"."UserRole" AS ENUM ('ADMINISTRATOR', 'OPERATOR', 'APPROVER', 'AUDITOR');
CREATE TYPE "execution"."OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "artifact"."ArtifactType" AS ENUM ('RAW_IMPORT', 'IMPORT_REPORT', 'OUTPUT_XLSX', 'EMAIL_PREVIEW', 'ERROR_REPORT', 'PROVIDER_EVENT');
CREATE TYPE "ingestion"."ImportBatchStatus" AS ENUM ('UPLOADED', 'VALIDATED', 'INVALID', 'FAILED');
CREATE TYPE "ingestion"."ImportRowStatus" AS ENUM ('VALID', 'INVALID', 'EXCLUDED');
CREATE TYPE "ingestion"."ValidationSeverity" AS ENUM ('ERROR', 'WARNING', 'INFO');

CREATE TABLE "identity"."users" (
  "id" VARCHAR(191) NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "displayName" VARCHAR(255),
  "role" "identity"."UserRole" NOT NULL DEFAULT 'AUDITOR',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "identity"."auth_sessions" (
  "id" VARCHAR(96) NOT NULL,
  "userId" VARCHAR(191) NOT NULL,
  "tokensEncrypted" TEXT NOT NULL,
  "keycloakSid" VARCHAR(191),
  "keycloakSub" VARCHAR(191),
  "keycloakClientId" VARCHAR(191),
  "refreshVersion" INTEGER NOT NULL DEFAULT 0,
  "lastRefreshedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "artifact"."file_artifacts" (
  "id" VARCHAR(191) NOT NULL,
  "artifactType" "artifact"."ArtifactType" NOT NULL,
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

CREATE TABLE "ingestion"."import_batches" (
  "id" VARCHAR(191) NOT NULL,
  "batchNumber" VARCHAR(50) NOT NULL,
  "sourceName" VARCHAR(200) NOT NULL,
  "schemaName" VARCHAR(100) NOT NULL,
  "schemaVersion" VARCHAR(30) NOT NULL,
  "rawArtifactId" VARCHAR(191) NOT NULL,
  "fileSha256" CHAR(64) NOT NULL,
  "columnMapping" JSONB NOT NULL,
  "status" "ingestion"."ImportBatchStatus" NOT NULL DEFAULT 'UPLOADED',
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

CREATE TABLE "ingestion"."import_rows" (
  "id" VARCHAR(191) NOT NULL,
  "importBatchId" VARCHAR(191) NOT NULL,
  "sourceSheet" VARCHAR(150) NOT NULL,
  "sourceRowNumber" INTEGER NOT NULL,
  "sourceRowId" VARCHAR(200),
  "rawData" JSONB NOT NULL,
  "normalizedData" JSONB NOT NULL,
  "status" "ingestion"."ImportRowStatus" NOT NULL,
  "warningAcknowledged" BOOLEAN NOT NULL DEFAULT false,
  "excludedReason" TEXT,
  "editedById" VARCHAR(191),
  "editedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ingestion"."import_validation_issues" (
  "id" VARCHAR(191) NOT NULL,
  "importBatchId" VARCHAR(191) NOT NULL,
  "importRowId" VARCHAR(191),
  "severity" "ingestion"."ValidationSeverity" NOT NULL,
  "errorCode" VARCHAR(80) NOT NULL,
  "fieldName" VARCHAR(100),
  "rejectedValue" TEXT,
  "message" TEXT NOT NULL,
  "acknowledgedById" VARCHAR(191),
  "acknowledgedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "import_validation_issues_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit"."audit_events" (
  "id" BIGSERIAL NOT NULL,
  "userId" VARCHAR(191),
  "action" VARCHAR(100) NOT NULL,
  "entityType" VARCHAR(100) NOT NULL,
  "entityId" VARCHAR(191),
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "execution"."outbox_events" (
  "id" VARCHAR(191) NOT NULL,
  "topic" VARCHAR(150) NOT NULL,
  "aggregateType" VARCHAR(100) NOT NULL,
  "aggregateId" VARCHAR(191) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "execution"."OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "holiday"."calendar_regions" (
  "id" VARCHAR(191) NOT NULL,
  "code" VARCHAR(16) NOT NULL,
  "displayName" VARCHAR(120) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "calendar_regions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "holiday"."calendar_region_aliases" (
  "id" VARCHAR(191) NOT NULL,
  "regionId" VARCHAR(191) NOT NULL,
  "alias" VARCHAR(120) NOT NULL,
  "normalizedAlias" VARCHAR(120) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "calendar_region_aliases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "identity"."users"("email");
CREATE INDEX "users_role_isActive_idx" ON "identity"."users"("role", "isActive");
CREATE INDEX "auth_sessions_userId_idx" ON "identity"."auth_sessions"("userId");
CREATE INDEX "auth_sessions_expiresAt_idx" ON "identity"."auth_sessions"("expiresAt");
CREATE INDEX "auth_sessions_keycloakSid_revokedAt_idx" ON "identity"."auth_sessions"("keycloakSid", "revokedAt");
CREATE INDEX "auth_sessions_revokedAt_expiresAt_idx" ON "identity"."auth_sessions"("revokedAt", "expiresAt");

CREATE UNIQUE INDEX "file_artifacts_storageKey_key" ON "artifact"."file_artifacts"("storageKey");
CREATE INDEX "file_artifacts_sha256_idx" ON "artifact"."file_artifacts"("sha256");
CREATE INDEX "file_artifacts_artifactType_createdAt_idx" ON "artifact"."file_artifacts"("artifactType", "createdAt");

CREATE UNIQUE INDEX "import_batches_batchNumber_key" ON "ingestion"."import_batches"("batchNumber");
CREATE UNIQUE INDEX "import_batches_rawArtifactId_key" ON "ingestion"."import_batches"("rawArtifactId");
CREATE INDEX "import_batches_fileSha256_idx" ON "ingestion"."import_batches"("fileSha256");
CREATE INDEX "import_batches_status_uploadedAt_idx" ON "ingestion"."import_batches"("status", "uploadedAt");
CREATE INDEX "import_rows_importBatchId_status_idx" ON "ingestion"."import_rows"("importBatchId", "status");
CREATE UNIQUE INDEX "import_rows_importBatchId_sourceSheet_sourceRowNumber_key" ON "ingestion"."import_rows"("importBatchId", "sourceSheet", "sourceRowNumber");
CREATE INDEX "import_validation_issues_importBatchId_severity_idx" ON "ingestion"."import_validation_issues"("importBatchId", "severity");
CREATE INDEX "import_validation_issues_importRowId_idx" ON "ingestion"."import_validation_issues"("importRowId");

CREATE INDEX "audit_events_userId_occurredAt_idx" ON "audit"."audit_events"("userId", "occurredAt");
CREATE INDEX "audit_events_entityType_entityId_idx" ON "audit"."audit_events"("entityType", "entityId");
CREATE INDEX "outbox_events_status_availableAt_idx" ON "execution"."outbox_events"("status", "availableAt");

CREATE UNIQUE INDEX "calendar_regions_code_key" ON "holiday"."calendar_regions"("code");
CREATE INDEX "calendar_regions_isActive_code_idx" ON "holiday"."calendar_regions"("isActive", "code");
CREATE UNIQUE INDEX "calendar_region_aliases_normalizedAlias_key" ON "holiday"."calendar_region_aliases"("normalizedAlias");
CREATE INDEX "calendar_region_aliases_regionId_isActive_idx" ON "holiday"."calendar_region_aliases"("regionId", "isActive");

ALTER TABLE "identity"."auth_sessions"
ADD CONSTRAINT "auth_sessions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "artifact"."file_artifacts"
ADD CONSTRAINT "file_artifacts_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ingestion"."import_batches"
ADD CONSTRAINT "import_batches_rawArtifactId_fkey"
FOREIGN KEY ("rawArtifactId") REFERENCES "artifact"."file_artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ingestion"."import_batches"
ADD CONSTRAINT "import_batches_uploadedById_fkey"
FOREIGN KEY ("uploadedById") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ingestion"."import_rows"
ADD CONSTRAINT "import_rows_importBatchId_fkey"
FOREIGN KEY ("importBatchId") REFERENCES "ingestion"."import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ingestion"."import_rows"
ADD CONSTRAINT "import_rows_editedById_fkey"
FOREIGN KEY ("editedById") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ingestion"."import_validation_issues"
ADD CONSTRAINT "import_validation_issues_importBatchId_fkey"
FOREIGN KEY ("importBatchId") REFERENCES "ingestion"."import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ingestion"."import_validation_issues"
ADD CONSTRAINT "import_validation_issues_importRowId_fkey"
FOREIGN KEY ("importRowId") REFERENCES "ingestion"."import_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ingestion"."import_validation_issues"
ADD CONSTRAINT "import_validation_issues_acknowledgedById_fkey"
FOREIGN KEY ("acknowledgedById") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit"."audit_events"
ADD CONSTRAINT "audit_events_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "holiday"."calendar_region_aliases"
ADD CONSTRAINT "calendar_region_aliases_regionId_fkey"
FOREIGN KEY ("regionId") REFERENCES "holiday"."calendar_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
