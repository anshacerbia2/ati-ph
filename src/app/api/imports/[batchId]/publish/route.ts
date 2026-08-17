import { Prisma } from "@prisma/client";

import {
  approvalEligibility,
  computeImportApprovalContentHash,
} from "@/approvals/import-approval";
import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import {
  expandHolidayDateRange,
  toDatabaseDate,
} from "@/holiday/publication";
import {
  collectRevisionTargetIds,
  validateRevisionTargets,
} from "@/holiday/revision";
import type { NormalizedHolidayRow } from "@/imports/contracts";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const RESOURCE_TYPE = "ImportBatch";

class PublicationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PublicationError";
  }
}

async function lockRevisionTargets(
  transaction: Prisma.TransactionClient,
  targetIds: readonly string[],
): Promise<void> {
  if (targetIds.length === 0) {
    return;
  }

  const ids = targetIds.map(
    (id) => Prisma.sql`${id}::uuid`,
  );

  await transaction.$queryRaw(
    Prisma.sql`
      SELECT "id"
      FROM "holiday_occurrences"
      WHERE "id" IN (${Prisma.join(ids)})
      ORDER BY "id"
      FOR UPDATE
    `,
  );
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.IMPORT_APPROVE);
  if (!access.ok) {
    return access.response;
  }

  const { batchId } = await params;

  try {
    const result = await db.$transaction(
      async (transaction) => {
        const batch = await transaction.importBatch.findUnique({
          where: { id: batchId },
          select: {
            id: true,
            batchNumber: true,
            status: true,
            validRows: true,
            invalidRows: true,
            submittedAt: true,
            publishedAt: true,
            verifiedAt: true,
            rows: {
              orderBy: [
                { sourceSheet: "asc" },
                { sourceRowNumber: "asc" },
              ],
              select: {
                id: true,
                sourceSheet: true,
                sourceRowNumber: true,
                revisionId: true,
                status: true,
                normalizedData: true,
                excludedReason: true,
              },
            },
            issues: {
              select: {
                severity: true,
                errorCode: true,
                fieldName: true,
                rejectedValue: true,
                message: true,
                acknowledgedAt: true,
                importRow: {
                  select: {
                    sourceSheet: true,
                    sourceRowNumber: true,
                  },
                },
              },
            },
          },
        });

        if (!batch) {
          throw new PublicationError(
            "Import batch was not found.",
            404,
          );
        }

        if (batch.publishedAt) {
          const [occurrenceCount, regionCount, dateCount] =
            await Promise.all([
              transaction.holidayOccurrence.count({
                where: { sourceImportBatchId: batch.id },
              }),
              transaction.holidayOccurrenceRegion.count({
                where: {
                  occurrence: {
                    sourceImportBatchId: batch.id,
                  },
                },
              }),
              transaction.holidayOccurrenceDate.count({
                where: {
                  occurrence: {
                    sourceImportBatchId: batch.id,
                  },
                },
              }),
            ]);

          return {
            alreadyPublished: true,
            publishedAt: batch.publishedAt,
            occurrenceCount,
            regionCount,
            dateCount,
          };
        }

        if (batch.status !== "VALIDATED" || !batch.verifiedAt) {
          throw new PublicationError(
            "Batch must complete authoritative workbook verification before publication.",
            409,
          );
        }

        if (!batch.submittedAt) {
          throw new PublicationError(
            "Batch must be approved and frozen before publication.",
            409,
          );
        }

        const approval =
          await transaction.approvalRequest.findFirst({
            where: {
              resourceType: RESOURCE_TYPE,
              resourceId: batch.id,
              status: "APPROVED",
            },
            orderBy: { decidedAt: "desc" },
            select: {
              id: true,
              contentHash: true,
              decidedAt: true,
            },
          });

        if (!approval) {
          throw new PublicationError(
            "An approved maker-checker decision is required.",
            409,
          );
        }

        const eligibility = approvalEligibility(batch);
        if (!eligibility.ok) {
          throw new PublicationError(
            eligibility.reason,
            409,
          );
        }

        const currentHash = computeImportApprovalContentHash(
          batch.rows.map((row) => ({
            ...row,
            normalizedData:
              row.normalizedData as unknown as NormalizedHolidayRow,
          })),
          batch.issues.map((issue) => ({
            severity: issue.severity,
            errorCode: issue.errorCode,
            fieldName: issue.fieldName,
            rejectedValue: issue.rejectedValue,
            message: issue.message,
            sourceSheet:
              issue.importRow?.sourceSheet ?? null,
            sourceRowNumber:
              issue.importRow?.sourceRowNumber ?? null,
            acknowledgedAt: issue.acknowledgedAt,
          })),
        );

        if (currentHash !== approval.contentHash) {
          throw new PublicationError(
            "Approved content hash no longer matches current staging.",
            409,
          );
        }

        const publishableRows = batch.rows.filter(
          (row) => row.status === "VALID",
        );

        if (publishableRows.length === 0) {
          throw new PublicationError(
            "No valid staging rows are available for publication.",
            409,
          );
        }

        const normalizedRows = publishableRows.map((row) => ({
          ...row,
          normalizedData:
            row.normalizedData as unknown as NormalizedHolidayRow,
        }));

        const revisionTargets =
          collectRevisionTargetIds(normalizedRows);
        if (!revisionTargets.ok) {
          throw new PublicationError(
            revisionTargets.reason,
            409,
          );
        }

        await lockRevisionTargets(
          transaction,
          revisionTargets.targetIds,
        );

        const revisionValidation =
          await validateRevisionTargets(
            transaction,
            normalizedRows,
          );
        if (!revisionValidation.ok) {
          throw new PublicationError(
            revisionValidation.reason,
            409,
          );
        }

        const requiredRegionCodes = [
          ...new Set(
            normalizedRows.flatMap(
              (row) => row.normalizedData.regionCodes,
            ),
          ),
        ].sort();

        const regions = await transaction.calendarRegion.findMany({
          where: {
            code: { in: requiredRegionCodes },
            isActive: true,
          },
          select: {
            id: true,
            code: true,
          },
        });

        const regionByCode = new Map(
          regions.map((region) => [
            region.code,
            region.id,
          ]),
        );
        const missingRegions = requiredRegionCodes.filter(
          (code) => !regionByCode.has(code),
        );

        if (missingRegions.length > 0) {
          throw new PublicationError(
            `Canonical regions became unavailable: ${missingRegions.join(", ")}.`,
            409,
          );
        }

        const now = new Date();
        let occurrenceCount = 0;
        let regionCount = 0;
        let dateCount = 0;
        let revisionCount = 0;
        const publishedOccurrenceIds: string[] = [];
        const supersededOccurrenceIds: string[] = [];

        for (const row of normalizedRows) {
          const value = row.normalizedData;

          if (
            !value.holidayName ||
            !value.normalizedHolidayName ||
            !value.startDate ||
            !value.endDate ||
            !value.calendarYear ||
            value.regionCodes.length === 0
          ) {
            throw new PublicationError(
              `Source row ${row.sourceRowNumber} is missing publishable normalized data.`,
              409,
            );
          }

          const definition =
            await transaction.holidayDefinition.upsert({
              where: {
                normalizedName:
                  value.normalizedHolidayName,
              },
              create: {
                canonicalName: value.holidayName,
                normalizedName:
                  value.normalizedHolidayName,
              },
              update: {},
              select: { id: true },
            });

          const revisesExisting =
            row.revisionId !== row.id;

          if (revisesExisting) {
            const superseded =
              await transaction.holidayOccurrence.updateMany({
                where: {
                  id: row.revisionId,
                  supersededAt: null,
                  notificationCommittedAt: null,
                },
                data: {
                  supersededAt: now,
                },
              });

            if (superseded.count !== 1) {
              throw new PublicationError(
                `Revision ID ${row.revisionId} became ineligible before publication.`,
                409,
              );
            }
          }

          const occurrence =
            await transaction.holidayOccurrence.create({
              data: {
                id: row.id,
                holidayDefinitionId: definition.id,
                sourceImportRowId: row.id,
                sourceImportBatchId: batch.id,
                startDate: toDatabaseDate(
                  value.startDate,
                ),
                endDate: toDatabaseDate(value.endDate),
                calendarYear: value.calendarYear,
                publishedById: access.session.user.id,
                publishedAt: now,
                supersedesOccurrenceId:
                  revisesExisting
                    ? row.revisionId
                    : null,
              },
              select: { id: true },
            });

          publishedOccurrenceIds.push(occurrence.id);
          if (revisesExisting) {
            revisionCount += 1;
            supersededOccurrenceIds.push(
              row.revisionId,
            );
          }

          const relationData = value.regionCodes.map(
            (code) => ({
              holidayOccurrenceId: occurrence.id,
              calendarRegionId: regionByCode.get(code)!,
            }),
          );

          await transaction.holidayOccurrenceRegion.createMany({
            data: relationData,
          });

          const expandedDates = expandHolidayDateRange(
            value.startDate,
            value.endDate,
          );

          await transaction.holidayOccurrenceDate.createMany({
            data: expandedDates.map((date) => ({
              holidayOccurrenceId: occurrence.id,
              occurrenceDate: toDatabaseDate(date.date),
              dayOfWeek: date.dayOfWeek,
              dayType: date.dayType,
            })),
          });

          occurrenceCount += 1;
          regionCount += relationData.length;
          dateCount += expandedDates.length;
        }

        await transaction.importBatch.update({
          where: { id: batch.id },
          data: { publishedAt: now },
        });

        await transaction.auditEvent.create({
          data: {
            userId: access.session.user.id,
            action: "IMPORT_BATCH_PUBLISHED",
            entityType: "ImportBatch",
            entityId: batch.id,
            metadata: {
              batchNumber: batch.batchNumber,
              approvalRequestId: approval.id,
              contentHash: approval.contentHash,
              occurrenceCount,
              regionCount,
              dateCount,
              revisionCount,
              publishedOccurrenceIds,
              supersededOccurrenceIds,
            },
          },
        });

        await transaction.outboxEvent.create({
          data: {
            topic: "HolidayCalendarPublished",
            aggregateType: "ImportBatch",
            aggregateId: batch.id,
            payload: {
              eventVersion: 1,
              importBatchId: batch.id,
              approvalRequestId: approval.id,
              contentHash: approval.contentHash,
              occurrenceCount,
              regionCount,
              dateCount,
              revisionCount,
              publishedOccurrenceIds,
              supersededOccurrenceIds,
              occurredAt: now.toISOString(),
            },
          },
        });

        return {
          alreadyPublished: false,
          publishedAt: now,
          occurrenceCount,
          regionCount,
          dateCount,
          revisionCount,
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return Response.json({
      publication: {
        ...result,
        publishedAt: result.publishedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof PublicationError) {
      return Response.json(
        { error: error.message },
        { status: error.status },
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        {
          error:
            "Canonical occurrence lineage already exists for one or more source rows.",
        },
        { status: 409 },
      );
    }

    console.error(
      "ATI PH canonical holiday publication failed.",
      error,
    );
    return Response.json(
      { error: "Canonical publication failed." },
      { status: 500 },
    );
  }
}
