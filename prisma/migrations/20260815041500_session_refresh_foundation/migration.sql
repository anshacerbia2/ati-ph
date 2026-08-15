ALTER TABLE "auth_sessions"
ADD COLUMN "keycloakSid" VARCHAR(191),
ADD COLUMN "keycloakSub" VARCHAR(191),
ADD COLUMN "keycloakClientId" VARCHAR(191),
ADD COLUMN "refreshVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastRefreshedAt" TIMESTAMP(3),
ADD COLUMN "revokedAt" TIMESTAMP(3);

CREATE INDEX "auth_sessions_keycloakSid_revokedAt_idx"
ON "auth_sessions"("keycloakSid", "revokedAt");

CREATE INDEX "auth_sessions_revokedAt_expiresAt_idx"
ON "auth_sessions"("revokedAt", "expiresAt");
