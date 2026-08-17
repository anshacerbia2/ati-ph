import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import {
  normalizeRevisionId,
  validateRevisionTargets,
} from "@/holiday/revision";
import type { NormalizedHolidayRow } from "@/imports/contracts";
import {
  parseStagingCorrection,
  type StagingRowCandidate,
  validateStagingRows,
} from "@/imports/staging-correction";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type MutationBody =
  | {
      action: "CORRECT";
      correction: unknown;
    }
  | {
      action: "EXCLUDE";
      reason: string;
    }
  | {
      action: "RESTORE";
    };

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ batchId: string; rowId: string }>;
  },
): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.IMPORT_CREATE);
  if (!access.ok) {
    return access.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Expected a JSON request body." },
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { action?: unknown }).action !== "string"
  ) {
    return Response.json(
      { error: "A staging mutation action is required." },
      { status: 400 },
    );
  }

  const mutation = body as MutationBody;
  if (
    mutation.action !== "CORRECT" &&
    mutation.action !== "EXCLUDE" &&
    mutation.action !== "RESTORE"
  ) {
    return Response.json(
      { error: "Unsupported staging mutation action." },
      { status: 400 },
    );
  }

  const { batchId, rowId } = await params;
  const batch = await db.importBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      batchNumber: true,
      status: true,
      submittedAt: true,
      publishedAt: true,
      rows: {
        orderBy: [
          { sourceSheet: "asc" },
          { sourceRowNumber: "asc" },
        ],
        select: {
          id: true,
          sourceRowNumber: true,
          revisionId: true,
          status: true,
          normalizedData: true,
          excludedReason: true,
        },
      },
      issues: {
        where: {
          importRowId: { not: null },
        },
        select: {
          importRowId: true,
          severity: true,
          errorCode: true,
          fieldName: true,
          rejectedValue: true,
          message: true,
          acknowledgedById: true,
          acknowledgedAt: true,
        },
      },
      _count: {
        select: {
          rows: true,
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

  if (
    batch.submittedAt ||
    batch.publishedAt ||
    batch.status === "UPLOADED" ||
    batch.status === "VERIFYING" ||
    batch.status === "FAILED"
  ) {
    return Response.json(
      {
        error:
          "This batch is frozen and cannot accept staging corrections.",
      },
      { status: 409 },
    );
  }

  const selected = batch.rows.find((row) => row.id === rowId);
  if (!selected) {
    return Response.json(
      { error: "Import staging row was not found." },
      { status: 404 },
    );
  }

  const beforeNormalizedData =
    selected.normalizedData as unknown as NormalizedHolidayRow;

  let selectedNormalizedData = beforeNormalizedData;
  let selectedRevisionId = selected.revisionId;
  let selectedExcludedReason: string | null =
    selected.excludedReason;
  let selectedStatus = selected.status;

  if (mutation.action === "CORRECT") {
    const parsed = parseStagingCorrection(
      beforeNormalizedData,
      mutation.correction,
    );

    if (!parsed.ok) {
      return Response.json(
        { error: parsed.error },
        { status: 400 },
      );
    }

    const revisionId = normalizeRevisionId(
      (
        mutation.correction as {
          revisionId?: unknown;
        }
      ).revisionId,
    );

    if (!revisionId.ok) {
      return Response.json(
        { error: revisionId.error },
        { status: 400 },
      );
    }

    selectedNormalizedData = parsed.value;
    selectedRevisionId = revisionId.value;
    selectedExcludedReason = null;
    selectedStatus = "VALID";
  }

  if (mutation.action === "EXCLUDE") {
    const reason =
      typeof mutation.reason === "string"
        ? mutation.reason.trim()
        : "";

    if (reason.length < 5 || reason.length > 500) {
      return Response.json(
        {
          error:
            "Exclusion reason must contain 5 to 500 characters.",
        },
        { status: 400 },
      );
    }

    selectedExcludedReason = reason;
    selectedStatus = "EXCLUDED";
  }

  if (mutation.action === "RESTORE") {
    selectedExcludedReason = null;
    selectedStatus = "VALID";
  }

  const activeRegions = await db.calendarRegion.findMany({
    where: { isActive: true },
    select: { code: true },
  });
  const activeRegionCodes = new Set(
    activeRegions.map((region) => region.code),
  );

  const candidates: Array<
    StagingRowCandidate & { revisionId: string }
  > = batch.rows.map((row) => ({
      id: row.id,
      sourceRowNumber: row.sourceRowNumber,
      revisionId:
        row.id === rowId ? selectedRevisionId : row.revisionId,
      status:
        row.id === rowId ? selectedStatus : row.status,
      normalizedData:
        row.id === rowId
          ? selectedNormalizedData
          : (row.normalizedData as unknown as NormalizedHolidayRow),
      excludedReason:
        row.id === rowId
          ? selectedExcludedReason
          : row.excludedReason,
    }),
  );

  const revisionValidation =
    await validateRevisionTargets(db, candidates);

  if (!revisionValidation.ok) {
    return Response.json(
      {
        error: revisionValidation.reason,
        code: revisionValidation.code,
        revisionId: revisionValidation.revisionId,
      },
      { status: 409 },
    );
  }

  const validation = validateStagingRows(
    candidates,
    activeRegionCodes,
  );

  const batchLevelWarningCount =
    await db.importValidationIssue.count({
      where: {
        importBatchId: batch.id,
        importRowId: null,
        severity: "WARNING",
      },
    });

  const nextBatchStatus =
    validation.invalidRows > 0 || validation.validRows === 0
      ? "INVALID"
      : "VALIDATED";

  const oldAcknowledgements = new Map(
    batch.issues
      .filter(
        (issue) =>
          issue.importRowId &&
          issue.severity === "WARNING" &&
          issue.acknowledgedAt,
      )
      .map((issue) => [
        issueKey({
          rowId: issue.importRowId!,
          severity: issue.severity,
          code: issue.errorCode,
          fieldName: issue.fieldName,
          rejectedValue: issue.rejectedValue,
          message: issue.message,
        }),
        {
          acknowledgedById: issue.acknowledgedById,
          acknowledgedAt: issue.acknowledgedAt,
        },
      ]),
  );

  const now = new Date();

  await db.$transaction(async (transaction) => {
    await transaction.importValidationIssue.deleteMany({
      where: {
        importBatchId: batch.id,
        importRowId: { not: null },
      },
    });

    if (validation.issues.length > 0) {
      await transaction.importValidationIssue.createMany({
        data: validation.issues.map((issue) => {
          const acknowledgement =
            issue.severity === "WARNING"
              ? oldAcknowledgements.get(
                  issueKey({
                    rowId: issue.rowId,
                    severity: issue.severity,
                    code: issue.code,
                    fieldName: issue.fieldName,
                    rejectedValue: issue.rejectedValue,
                    message: issue.message,
                  }),
                )
              : undefined;

          return {
            id: randomUUID(),
            importBatchId: batch.id,
            importRowId: issue.rowId,
            severity: issue.severity,
            errorCode: issue.code,
            fieldName: issue.fieldName,
            rejectedValue: issue.rejectedValue,
            message: issue.message,
            acknowledgedById:
              acknowledgement?.acknowledgedById ?? undefined,
            acknowledgedAt:
              acknowledgement?.acknowledgedAt ?? undefined,
          };
        }),
      });
    }

    for (const row of candidates) {
      const data: Prisma.ImportRowUpdateInput = {
        status: validation.statuses.get(row.id)!,
      };

      if (row.id === selected.id) {
        data.normalizedData = asJson(row.normalizedData);
        data.revisionId = selectedRevisionId;
        data.excludedReason = selectedExcludedReason;
        data.editedBy = {
          connect: { id: access.session.user.id },
        };
        data.editedAt = now;
      }

      await transaction.importRow.update({
        where: { id: row.id },
        data,
      });
    }

    await transaction.importBatch.update({
      where: { id: batch.id },
      data: {
        status: nextBatchStatus,
        validRows: validation.validRows,
        invalidRows: validation.invalidRows,
        warningCount:
          batchLevelWarningCount + validation.warningCount,
      },
    });

    await transaction.auditEvent.create({
      data: {
        userId: access.session.user.id,
        action:
          mutation.action === "CORRECT"
            ? "IMPORT_STAGING_ROW_CORRECTED"
            : mutation.action === "EXCLUDE"
              ? "IMPORT_STAGING_ROW_EXCLUDED"
              : "IMPORT_STAGING_ROW_RESTORED",
        entityType: "ImportRow",
        entityId: selected.id,
        metadata: {
          importBatchId: batch.id,
          batchNumber: batch.batchNumber,
          sourceRowNumber: selected.sourceRowNumber,
          previousBatchStatus: batch.status,
          nextBatchStatus,
          beforeNormalizedData,
          afterNormalizedData: selectedNormalizedData,
          beforeRevisionId: selected.revisionId,
          afterRevisionId: selectedRevisionId,
          exclusionReason: selectedExcludedReason,
        },
      },
    });

    if (nextBatchStatus !== batch.status) {
      await transaction.outboxEvent.create({
        data: {
          topic: "ImportBatchValidationChanged",
          aggregateType: "ImportBatch",
          aggregateId: batch.id,
          payload: {
            eventVersion: 1,
            importBatchId: batch.id,
            previousStatus: batch.status,
            nextStatus: nextBatchStatus,
            editedRowId: selected.id,
            occurredAt: now.toISOString(),
          },
        },
      });
    }
  });

  return Response.json({
    batch: {
      id: batch.id,
      status: nextBatchStatus,
      validRows: validation.validRows,
      invalidRows: validation.invalidRows,
      warningCount:
        batchLevelWarningCount + validation.warningCount,
    },
  });
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value),
  ) as Prisma.InputJsonValue;
}

function issueKey(issue: {
  rowId: string;
  severity: string;
  code: string;
  fieldName?: string | null;
  rejectedValue?: string | null;
  message: string;
}): string {
  return JSON.stringify([
    issue.rowId,
    issue.severity,
    issue.code,
    issue.fieldName ?? null,
    issue.rejectedValue ?? null,
    issue.message,
  ]);
}
