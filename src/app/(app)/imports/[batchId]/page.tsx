import { notFound, redirect } from "next/navigation";

import { PERMISSIONS } from "@/auth/authorization-catalog";
import { getUserAuthorization } from "@/auth/authorization";
import { getCurrentSession } from "@/auth/session";
import { AccessDenied } from "@/components/app-shell/AccessDenied";
import { PageHeader } from "@/components/app-shell/PageHeader";
import { ImportBatchReview } from "@/components/ph-dashboard/ImportBatchReview";
import type { NormalizedHolidayRow } from "@/imports/contracts";
import { db } from "@/lib/db";

export default async function ImportBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  const authorization = await getUserAuthorization(session.user.id);
  const permissions = new Set(authorization.permissions);

  if (!permissions.has(PERMISSIONS.IMPORT_READ)) {
    return <AccessDenied />;
  }

  const { batchId } = await params;
  const [batch, activeRegions, approvals] = await Promise.all([
    db.importBatch.findUnique({
      where: { id: batchId },
      select: {
        id: true,
        batchNumber: true,
        sourceName: true,
        status: true,
        schemaVersion: true,
        totalRows: true,
        validRows: true,
        invalidRows: true,
        warningCount: true,
        verificationStartedAt: true,
        verifiedAt: true,
        failureReason: true,
        submittedAt: true,
        publishedAt: true,
        uploadedAt: true,
        uploadedBy: {
          select: {
            displayName: true,
            email: true,
          },
        },
        rows: {
          orderBy: [
            { sourceSheet: "asc" },
            { sourceRowNumber: "asc" },
          ],
          select: {
            id: true,
            sourceSheet: true,
            sourceRowNumber: true,
            status: true,
            normalizedData: true,
            excludedReason: true,
            editedAt: true,
            editedBy: {
              select: {
                displayName: true,
                email: true,
              },
            },
          },
        },
        issues: {
          orderBy: [
            { severity: "asc" },
            { createdAt: "asc" },
            { id: "asc" },
          ],
          select: {
            id: true,
            severity: true,
            errorCode: true,
            fieldName: true,
            rejectedValue: true,
            message: true,
            acknowledgedAt: true,
            acknowledgedBy: {
              select: {
                displayName: true,
                email: true,
              },
            },
            importRow: {
              select: {
                sourceSheet: true,
                sourceRowNumber: true,
              },
            },
          },
        },
        publishedOccurrences: {
          orderBy: [
            { startDate: "asc" },
            { id: "asc" },
          ],
          select: {
            id: true,
            startDate: true,
            endDate: true,
            calendarYear: true,
            publishedAt: true,
            definition: {
              select: {
                canonicalName: true,
              },
            },
            sourceImportRow: {
              select: {
                sourceRowNumber: true,
              },
            },
            regions: {
              orderBy: {
                calendarRegion: {
                  code: "asc",
                },
              },
              select: {
                calendarRegion: {
                  select: {
                    code: true,
                  },
                },
              },
            },
            dates: {
              orderBy: { occurrenceDate: "asc" },
              select: {
                occurrenceDate: true,
                dayOfWeek: true,
                dayType: true,
              },
            },
          },
        },
      },
    }),
    db.calendarRegion.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: {
        code: true,
        displayName: true,
      },
    }),
    db.approvalRequest.findMany({
      where: {
        resourceType: "ImportBatch",
        resourceId: batchId,
      },
      orderBy: { requestedAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        contentHash: true,
        requestedAt: true,
        decidedAt: true,
        decisionReason: true,
        requestedById: true,
        requestedBy: {
          select: {
            displayName: true,
            email: true,
          },
        },
        decidedBy: {
          select: {
            displayName: true,
            email: true,
          },
        },
      },
    }),
  ]);

  if (!batch) {
    notFound();
  }

  return (
    <div className="page-stack">
      <PageHeader
        description="Review, correct, approve, and publish governed holiday data with source-to-canonical lineage."
        eyebrow="Governed import"
        title={batch.batchNumber}
      />

      <ImportBatchReview
        activeRegions={activeRegions}
        approvals={approvals.map((approval) => ({
          id: approval.id,
          status: approval.status,
          contentHash: approval.contentHash,
          requestedAt: approval.requestedAt.toISOString(),
          decidedAt: approval.decidedAt?.toISOString() ?? null,
          decisionReason: approval.decisionReason,
          requestedById: approval.requestedById,
          requestedBy:
            approval.requestedBy.displayName ??
            approval.requestedBy.email,
          decidedBy:
            approval.decidedBy?.displayName ??
            approval.decidedBy?.email ??
            null,
        }))}
        batch={{
          ...batch,
          submittedAt: batch.submittedAt?.toISOString() ?? null,
          publishedAt: batch.publishedAt?.toISOString() ?? null,
          verificationStartedAt:
            batch.verificationStartedAt?.toISOString() ?? null,
          verifiedAt: batch.verifiedAt?.toISOString() ?? null,
          uploadedAt: batch.uploadedAt.toISOString(),
          frozen: Boolean(
            batch.submittedAt || batch.publishedAt,
          ),
          rows: batch.rows.map((row) => ({
            ...row,
            normalizedData:
              row.normalizedData as unknown as NormalizedHolidayRow,
            editedAt: row.editedAt?.toISOString() ?? null,
            editedBy:
              row.editedBy?.displayName ??
              row.editedBy?.email ??
              null,
          })),
          issues: batch.issues.map((issue) => ({
            ...issue,
            acknowledgedAt:
              issue.acknowledgedAt?.toISOString() ?? null,
            acknowledgedBy:
              issue.acknowledgedBy?.displayName ??
              issue.acknowledgedBy?.email ??
              null,
            sourceSheet: issue.importRow?.sourceSheet ?? null,
            sourceRowNumber:
              issue.importRow?.sourceRowNumber ?? null,
            importRow: undefined,
          })),
          publishedOccurrences:
            batch.publishedOccurrences.map((occurrence) => ({
              id: occurrence.id,
              holidayName:
                occurrence.definition.canonicalName,
              sourceRowNumber:
                occurrence.sourceImportRow.sourceRowNumber,
              startDate:
                occurrence.startDate
                  .toISOString()
                  .slice(0, 10),
              endDate:
                occurrence.endDate
                  .toISOString()
                  .slice(0, 10),
              calendarYear: occurrence.calendarYear,
              publishedAt:
                occurrence.publishedAt.toISOString(),
              regionCodes: occurrence.regions.map(
                (relation) =>
                  relation.calendarRegion.code,
              ),
              dates: occurrence.dates.map((date) => ({
                date: date.occurrenceDate
                  .toISOString()
                  .slice(0, 10),
                dayOfWeek: date.dayOfWeek,
                dayType: date.dayType,
              })),
            })),
        }}
        canApprove={permissions.has(PERMISSIONS.IMPORT_APPROVE)}
        canEditStaging={
          !batch.submittedAt &&
          !batch.publishedAt &&
          (batch.status === "VALIDATED" || batch.status === "INVALID") &&
          permissions.has(PERMISSIONS.IMPORT_CREATE)
        }
        canPublish={permissions.has(PERMISSIONS.IMPORT_APPROVE)}
        currentUserId={session.user.id}
      />
    </div>
  );
}
