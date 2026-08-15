-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('RAW_IMPORT', 'IMPORT_REPORT', 'OUTPUT_XLSX', 'EMAIL_PREVIEW', 'ERROR_REPORT', 'PROVIDER_EVENT');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('UPLOADED', 'VALIDATED', 'INVALID', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('VALID', 'INVALID', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "ValidationSeverity" AS ENUM ('ERROR', 'WARNING', 'INFO');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "externalSubject" VARCHAR(191) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "displayName" VARCHAR(255),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_artifacts" (
    "id" UUID NOT NULL,
    "artifactType" "ArtifactType" NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(150) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "storageProvider" VARCHAR(40) NOT NULL,
    "storageKey" VARCHAR(1000) NOT NULL,
    "retentionClass" VARCHAR(50) NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "batchNumber" VARCHAR(50) NOT NULL,
    "sourceName" VARCHAR(200) NOT NULL,
    "schemaName" VARCHAR(100) NOT NULL,
    "schemaVersion" VARCHAR(30) NOT NULL,
    "rawArtifactId" UUID NOT NULL,
    "fileSha256" CHAR(64) NOT NULL,
    "columnMapping" JSONB NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'UPLOADED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" UUID NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "failureReason" TEXT,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" UUID NOT NULL,
    "importBatchId" UUID NOT NULL,
    "sourceSheet" VARCHAR(150) NOT NULL,
    "sourceRowNumber" INTEGER NOT NULL,
    "sourceRowId" VARCHAR(200),
    "rawData" JSONB NOT NULL,
    "normalizedData" JSONB NOT NULL,
    "status" "ImportRowStatus" NOT NULL,
    "warningAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "excludedReason" TEXT,
    "editedById" UUID,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_validation_issues" (
    "id" UUID NOT NULL,
    "importBatchId" UUID NOT NULL,
    "importRowId" UUID,
    "severity" "ValidationSeverity" NOT NULL,
    "errorCode" VARCHAR(80) NOT NULL,
    "fieldName" VARCHAR(100),
    "rejectedValue" TEXT,
    "message" TEXT NOT NULL,
    "acknowledgedById" UUID,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_validation_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" VARCHAR(96) NOT NULL,
    "userId" UUID NOT NULL,
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

-- CreateTable
CREATE TABLE "audit_events" (
    "id" BIGSERIAL NOT NULL,
    "userId" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entityType" VARCHAR(100) NOT NULL,
    "entityId" VARCHAR(191),
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "topic" VARCHAR(150) NOT NULL,
    "aggregateType" VARCHAR(100) NOT NULL,
    "aggregateId" VARCHAR(191) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(120) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "path" VARCHAR(255),
    "parentId" UUID,
    "requiredPermissionId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_regions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "displayName" VARCHAR(120) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_region_aliases" (
    "id" UUID NOT NULL,
    "regionId" UUID NOT NULL,
    "alias" VARCHAR(120) NOT NULL,
    "normalizedAlias" VARCHAR(120) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_region_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_externalSubject_key" ON "users"("externalSubject");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

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

-- CreateIndex
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");

-- CreateIndex
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "auth_sessions_keycloakSid_revokedAt_idx" ON "auth_sessions"("keycloakSid", "revokedAt");

-- CreateIndex
CREATE INDEX "auth_sessions_revokedAt_expiresAt_idx" ON "auth_sessions"("revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "audit_events_userId_occurredAt_idx" ON "audit_events"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_events_entityType_entityId_idx" ON "audit_events"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "outbox_events_status_availableAt_idx" ON "outbox_events"("status", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "roles_isActive_code_idx" ON "roles"("isActive", "code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_isActive_code_idx" ON "permissions"("isActive", "code");

-- CreateIndex
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

-- CreateIndex
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "menus_code_key" ON "menus"("code");

-- CreateIndex
CREATE INDEX "menus_parentId_sortOrder_idx" ON "menus"("parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "menus_requiredPermissionId_idx" ON "menus"("requiredPermissionId");

-- CreateIndex
CREATE INDEX "menus_isActive_sortOrder_idx" ON "menus"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_regions_code_key" ON "calendar_regions"("code");

-- CreateIndex
CREATE INDEX "calendar_regions_isActive_code_idx" ON "calendar_regions"("isActive", "code");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_region_aliases_normalizedAlias_key" ON "calendar_region_aliases"("normalizedAlias");

-- CreateIndex
CREATE INDEX "calendar_region_aliases_regionId_isActive_idx" ON "calendar_region_aliases"("regionId", "isActive");

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

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_requiredPermissionId_fkey" FOREIGN KEY ("requiredPermissionId") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_region_aliases" ADD CONSTRAINT "calendar_region_aliases_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "calendar_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

