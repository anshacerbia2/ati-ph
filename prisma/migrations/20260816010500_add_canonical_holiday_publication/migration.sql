-- CreateTable
CREATE TABLE "holiday_definitions" (
    "id" UUID NOT NULL,
    "canonicalName" VARCHAR(200) NOT NULL,
    "normalizedName" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holiday_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holiday_occurrences" (
    "id" UUID NOT NULL,
    "holidayDefinitionId" UUID NOT NULL,
    "sourceImportRowId" UUID NOT NULL,
    "sourceImportBatchId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "calendarYear" INTEGER NOT NULL,
    "publishedById" UUID NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holiday_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holiday_occurrence_regions" (
    "holidayOccurrenceId" UUID NOT NULL,
    "calendarRegionId" UUID NOT NULL,

    CONSTRAINT "holiday_occurrence_regions_pkey"
      PRIMARY KEY ("holidayOccurrenceId", "calendarRegionId")
);

-- CreateTable
CREATE TABLE "holiday_occurrence_dates" (
    "id" UUID NOT NULL,
    "holidayOccurrenceId" UUID NOT NULL,
    "occurrenceDate" DATE NOT NULL,
    "dayOfWeek" VARCHAR(9) NOT NULL,
    "dayType" VARCHAR(8) NOT NULL,

    CONSTRAINT "holiday_occurrence_dates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "holiday_definitions_normalizedName_key"
ON "holiday_definitions"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "holiday_occurrences_sourceImportRowId_key"
ON "holiday_occurrences"("sourceImportRowId");

-- CreateIndex
CREATE INDEX "holiday_occurrences_sourceImportBatchId_publishedAt_idx"
ON "holiday_occurrences"("sourceImportBatchId", "publishedAt");

-- CreateIndex
CREATE INDEX "holiday_occurrences_calendarYear_startDate_idx"
ON "holiday_occurrences"("calendarYear", "startDate");

-- CreateIndex
CREATE INDEX "holiday_occurrence_regions_calendarRegionId_holidayOccurrenceId_idx"
ON "holiday_occurrence_regions"("calendarRegionId", "holidayOccurrenceId");

-- CreateIndex
CREATE UNIQUE INDEX "holiday_occurrence_dates_holidayOccurrenceId_occurrenceDate_key"
ON "holiday_occurrence_dates"("holidayOccurrenceId", "occurrenceDate");

-- CreateIndex
CREATE INDEX "holiday_occurrence_dates_occurrenceDate_idx"
ON "holiday_occurrence_dates"("occurrenceDate");

-- AddForeignKey
ALTER TABLE "holiday_occurrences"
ADD CONSTRAINT "holiday_occurrences_holidayDefinitionId_fkey"
FOREIGN KEY ("holidayDefinitionId") REFERENCES "holiday_definitions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_occurrences"
ADD CONSTRAINT "holiday_occurrences_sourceImportRowId_fkey"
FOREIGN KEY ("sourceImportRowId") REFERENCES "import_rows"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_occurrences"
ADD CONSTRAINT "holiday_occurrences_sourceImportBatchId_fkey"
FOREIGN KEY ("sourceImportBatchId") REFERENCES "import_batches"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_occurrences"
ADD CONSTRAINT "holiday_occurrences_publishedById_fkey"
FOREIGN KEY ("publishedById") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_occurrence_regions"
ADD CONSTRAINT "holiday_occurrence_regions_holidayOccurrenceId_fkey"
FOREIGN KEY ("holidayOccurrenceId") REFERENCES "holiday_occurrences"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_occurrence_regions"
ADD CONSTRAINT "holiday_occurrence_regions_calendarRegionId_fkey"
FOREIGN KEY ("calendarRegionId") REFERENCES "calendar_regions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday_occurrence_dates"
ADD CONSTRAINT "holiday_occurrence_dates_holidayOccurrenceId_fkey"
FOREIGN KEY ("holidayOccurrenceId") REFERENCES "holiday_occurrences"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
