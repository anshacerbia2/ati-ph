-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "resourceType" VARCHAR(100) NOT NULL,
    "resourceId" VARCHAR(191) NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "activeResourceKey" VARCHAR(320),
    "requestedById" UUID NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "approval_requests_activeResourceKey_key"
ON "approval_requests"("activeResourceKey");

CREATE INDEX "approval_requests_resourceType_resourceId_requestedAt_idx"
ON "approval_requests"("resourceType", "resourceId", "requestedAt");

CREATE INDEX "approval_requests_status_requestedAt_idx"
ON "approval_requests"("status", "requestedAt");

ALTER TABLE "approval_requests"
ADD CONSTRAINT "approval_requests_requestedById_fkey"
FOREIGN KEY ("requestedById") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approval_requests"
ADD CONSTRAINT "approval_requests_decidedById_fkey"
FOREIGN KEY ("decidedById") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
