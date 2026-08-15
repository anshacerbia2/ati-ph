import { Prisma } from "@prisma/client";

import {
  approvalEligibility,
  computeImportApprovalContentHash,
} from "@/approvals/import-approval";
import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import type { NormalizedHolidayRow } from "@/imports/contracts";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const RESOURCE_TYPE = "ImportBatch";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.IMPORT_CREATE);
  if (!access.ok) {
    return access.response;
  }

  const { batchId } = await params;
  const batch = await loadApprovalBatch(batchId);

  if (!batch) {
    return Response.json(
      { error: "Import batch was not found." },
      { status: 404 },
    );
  }

  if (batch.publishedAt) {
    return Response.json(
      { error: "Published batches cannot enter approval again." },
      { status: 409 },
    );
  }

  if (batch.submittedAt) {
    return Response.json(
      { error: "Batch is already submitted for approval." },
      { status: 409 },
    );
  }

  const eligibility = approvalEligibility(batch);
  if (!eligibility.ok) {
    return Response.json(
      { error: eligibility.reason },
      { status: 409 },
    );
  }

  const contentHash = contentHashFor(batch);
  const now = new Date();
  const activeResourceKey = resourceKey(batch.id);

  try {
    const approval = await db.$transaction(async (transaction) => {
      const created = await transaction.approvalRequest.create({
        data: {
          resourceType: RESOURCE_TYPE,
          resourceId: batch.id,
          contentHash,
          activeResourceKey,
          requestedById: access.session.user.id,
        },
      });

      await transaction.importBatch.update({
        where: { id: batch.id },
        data: { submittedAt: now },
      });

      await transaction.auditEvent.create({
        data: {
          userId: access.session.user.id,
          action: "IMPORT_APPROVAL_REQUESTED",
          entityType: "ApprovalRequest",
          entityId: created.id,
          metadata: {
            importBatchId: batch.id,
            batchNumber: batch.batchNumber,
            contentHash,
          },
        },
      });

      await transaction.outboxEvent.create({
        data: {
          topic: "ImportApprovalRequested",
          aggregateType: "ImportBatch",
          aggregateId: batch.id,
          payload: {
            eventVersion: 1,
            importBatchId: batch.id,
            approvalRequestId: created.id,
            contentHash,
            occurredAt: now.toISOString(),
          },
        },
      });

      return created;
    });

    return Response.json(
      { approval: { id: approval.id, status: approval.status } },
      { status: 201 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "An active approval request already exists." },
        { status: 409 },
      );
    }

    console.error("ATI PH approval submission failed.", error);
    return Response.json(
      { error: "Approval request could not be created." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.IMPORT_APPROVE);
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

  if (!body || typeof body !== "object") {
    return Response.json(
      { error: "Approval decision is required." },
      { status: 400 },
    );
  }

  const decision = (body as { decision?: unknown }).decision;
  const rawReason = (body as { reason?: unknown }).reason;

  if (decision !== "APPROVE" && decision !== "REJECT") {
    return Response.json(
      { error: "decision must be APPROVE or REJECT." },
      { status: 400 },
    );
  }

  const reason =
    typeof rawReason === "string" ? rawReason.trim() : "";

  if (
    decision === "REJECT" &&
    (reason.length < 5 || reason.length > 1000)
  ) {
    return Response.json(
      {
        error:
          "Rejection reason must contain 5 to 1000 characters.",
      },
      { status: 400 },
    );
  }

  if (decision === "APPROVE" && reason.length > 1000) {
    return Response.json(
      { error: "Decision note cannot exceed 1000 characters." },
      { status: 400 },
    );
  }

  const { batchId } = await params;
  const [batch, approval] = await Promise.all([
    loadApprovalBatch(batchId),
    db.approvalRequest.findUnique({
      where: { activeResourceKey: resourceKey(batchId) },
      select: {
        id: true,
        status: true,
        contentHash: true,
        requestedById: true,
      },
    }),
  ]);

  if (!batch) {
    return Response.json(
      { error: "Import batch was not found." },
      { status: 404 },
    );
  }

  if (!approval || approval.status !== "PENDING") {
    return Response.json(
      { error: "No pending approval request exists." },
      { status: 409 },
    );
  }

  if (approval.requestedById === access.session.user.id) {
    return Response.json(
      { error: "Maker-checker requires a different approver." },
      { status: 409 },
    );
  }

  if (!batch.submittedAt || batch.publishedAt) {
    return Response.json(
      { error: "Batch is not in an approvable frozen state." },
      { status: 409 },
    );
  }

  if (decision === "APPROVE") {
    const eligibility = approvalEligibility(batch);
    if (!eligibility.ok) {
      return Response.json(
        { error: eligibility.reason },
        { status: 409 },
      );
    }
  }

  const currentHash = contentHashFor(batch);
  if (currentHash !== approval.contentHash) {
    return Response.json(
      {
        error:
          "Frozen approval content no longer matches the submitted hash.",
      },
      { status: 409 },
    );
  }

  const now = new Date();
  const nextStatus =
    decision === "APPROVE" ? "APPROVED" : "REJECTED";

  await db.$transaction(async (transaction) => {
    await transaction.approvalRequest.update({
      where: { id: approval.id },
      data: {
        status: nextStatus,
        activeResourceKey: null,
        decidedById: access.session.user.id,
        decidedAt: now,
        decisionReason: reason || null,
      },
    });

    if (decision === "REJECT") {
      await transaction.importBatch.update({
        where: { id: batch.id },
        data: { submittedAt: null },
      });
    }

    await transaction.auditEvent.create({
      data: {
        userId: access.session.user.id,
        action:
          decision === "APPROVE"
            ? "IMPORT_APPROVAL_APPROVED"
            : "IMPORT_APPROVAL_REJECTED",
        entityType: "ApprovalRequest",
        entityId: approval.id,
        metadata: {
          importBatchId: batch.id,
          batchNumber: batch.batchNumber,
          contentHash: approval.contentHash,
          decisionReason: reason || null,
        },
      },
    });

    await transaction.outboxEvent.create({
      data: {
        topic:
          decision === "APPROVE"
            ? "ImportApprovalApproved"
            : "ImportApprovalRejected",
        aggregateType: "ImportBatch",
        aggregateId: batch.id,
        payload: {
          eventVersion: 1,
          importBatchId: batch.id,
          approvalRequestId: approval.id,
          contentHash: approval.contentHash,
          reason: reason || null,
          occurredAt: now.toISOString(),
        },
      },
    });
  });

  return Response.json({
    approval: {
      id: approval.id,
      status: nextStatus,
    },
  });
}

async function loadApprovalBatch(batchId: string) {
  return db.importBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      batchNumber: true,
      status: true,
      validRows: true,
      invalidRows: true,
      submittedAt: true,
      publishedAt: true,
      rows: {
        select: {
          id: true,
          sourceSheet: true,
          sourceRowNumber: true,
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
}

function contentHashFor(
  batch: NonNullable<
    Awaited<ReturnType<typeof loadApprovalBatch>>
  >,
): string {
  return computeImportApprovalContentHash(
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
      sourceSheet: issue.importRow?.sourceSheet ?? null,
      sourceRowNumber:
        issue.importRow?.sourceRowNumber ?? null,
      acknowledgedAt: issue.acknowledgedAt,
    })),
  );
}

function resourceKey(batchId: string): string {
  return `${RESOURCE_TYPE}:${batchId}`;
}
