import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import { buildValidationReportCsv } from "@/imports/validation-report";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.IMPORT_READ);
  if (!access.ok) {
    return access.response;
  }

  const { batchId } = await params;
  const batch = await db.importBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      batchNumber: true,
      status: true,
      sourceName: true,
      schemaName: true,
      schemaVersion: true,
      totalRows: true,
      validRows: true,
      invalidRows: true,
      warningCount: true,
      uploadedAt: true,
      issues: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          severity: true,
          errorCode: true,
          fieldName: true,
          rejectedValue: true,
          message: true,
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
    return Response.json(
      { error: "Import batch was not found." },
      { status: 404 },
    );
  }

  const csv = buildValidationReportCsv(
    {
      batchNumber: batch.batchNumber,
      status: batch.status,
      sourceName: batch.sourceName,
      schemaName: batch.schemaName,
      schemaVersion: batch.schemaVersion,
      totalRows: batch.totalRows,
      validRows: batch.validRows,
      invalidRows: batch.invalidRows,
      warningCount: batch.warningCount,
      uploadedAt: batch.uploadedAt,
    },
    batch.issues.map((issue) => ({
      severity: issue.severity,
      errorCode: issue.errorCode,
      sourceSheet: issue.importRow?.sourceSheet,
      sourceRowNumber: issue.importRow?.sourceRowNumber,
      fieldName: issue.fieldName ?? undefined,
      rejectedValue: issue.rejectedValue ?? undefined,
      message: issue.message,
    })),
  );

  try {
    await db.auditEvent.create({
      data: {
        userId: access.session.user.id,
        action: "IMPORT_VALIDATION_REPORT_DOWNLOADED",
        entityType: "ImportBatch",
        entityId: batch.id,
        metadata: {
          batchNumber: batch.batchNumber,
          format: "CSV",
          issueCount: batch.issues.length,
        },
      },
    });
  } catch (error) {
    console.error(
      "ATI PH validation-report download could not be audited.",
      error,
    );
    return Response.json(
      { error: "Validation report could not be released." },
      { status: 500 },
    );
  }

  return new Response(csv, {
    status: 200,
    headers: {
      "cache-control": "private, no-store",
      "content-disposition":
        `attachment; filename="${batch.batchNumber}-validation-report.csv"`,
      "content-type": "text/csv; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}
