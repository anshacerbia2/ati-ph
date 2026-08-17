-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "normalizedName" VARCHAR(200) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_teams" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "normalizedName" VARCHAR(200) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "displayName" VARCHAR(200),
    "email" VARCHAR(320) NOT NULL,
    "normalizedEmail" VARCHAR(320) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_subscriptions" (
    "id" UUID NOT NULL,
    "serviceTeamId" UUID NOT NULL,
    "calendarRegionId" UUID NOT NULL,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_recipients" (
    "subscriptionId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_recipients_pkey" PRIMARY KEY ("subscriptionId","contactId")
);

-- CreateIndex
CREATE UNIQUE INDEX "clients_normalizedName_key" ON "clients"("normalizedName");

-- CreateIndex
CREATE INDEX "clients_isActive_name_idx" ON "clients"("isActive", "name");

-- CreateIndex
CREATE INDEX "service_teams_clientId_isActive_name_idx" ON "service_teams"("clientId", "isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "service_teams_clientId_normalizedName_key" ON "service_teams"("clientId", "normalizedName");

-- CreateIndex
CREATE INDEX "contacts_clientId_isActive_idx" ON "contacts"("clientId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_clientId_normalizedEmail_key" ON "contacts"("clientId", "normalizedEmail");

-- CreateIndex
CREATE INDEX "client_subscriptions_serviceTeamId_calendarRegionId_idx" ON "client_subscriptions"("serviceTeamId", "calendarRegionId");

-- CreateIndex
CREATE INDEX "client_subscriptions_calendarRegionId_isActive_idx" ON "client_subscriptions"("calendarRegionId", "isActive");

-- CreateIndex
CREATE INDEX "client_subscriptions_serviceTeamId_isActive_idx" ON "client_subscriptions"("serviceTeamId", "isActive");

-- CreateIndex
CREATE INDEX "subscription_recipients_contactId_isActive_idx" ON "subscription_recipients"("contactId", "isActive");

-- AddForeignKey
ALTER TABLE "service_teams" ADD CONSTRAINT "service_teams_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_subscriptions" ADD CONSTRAINT "client_subscriptions_serviceTeamId_fkey" FOREIGN KEY ("serviceTeamId") REFERENCES "service_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_subscriptions" ADD CONSTRAINT "client_subscriptions_calendarRegionId_fkey" FOREIGN KEY ("calendarRegionId") REFERENCES "calendar_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_recipients" ADD CONSTRAINT "subscription_recipients_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "client_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_recipients" ADD CONSTRAINT "subscription_recipients_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
