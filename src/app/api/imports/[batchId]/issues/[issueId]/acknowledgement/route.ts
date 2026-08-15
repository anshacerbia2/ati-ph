import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ batchId: string; issueId: string }>;
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
    typeof (body as { acknowledged?: unknown }).acknowledged !== "boolean"
  ) {
    return Response.json(
      { error: "acknowledged must be a boolean." },
      { status: 400 },
    );
  }

  const acknowledged = (body as { acknowledged: boolean }).acknowledged;
  const { batchId, issueId } = await params;

  const issue = await db.importValidationIssue.findFirst({
    where: {
      id: issueId,
      importBatchId: batchId,
    },
    select: {
      id: true,
      severity: true,
      errorCode: true,
      acknowledgedAt: true,
      importBatch: {
        select: {
          id: true,
          batchNumber: true,
          submittedAt: true,
          publishedAt: true,
        },
      },
    },
  });

  if (!issue) {
    return Response.json(
      { error: "Validation issue was not found." },
      { status: 404 },
    );
  }

  if (
    issue.importBatch.submittedAt ||
    issue.importBatch.publishedAt
  ) {
    return Response.json(
      {
        error:
          "Submitted or published batches are frozen against warning acknowledgement changes.",
      },
      { status: 409 },
    );
  }

  if (issue.severity !== "WARNING") {
    return Response.json(
      {
        error:
          "Only WARNING validation issues can be acknowledged.",
      },
      { status: 409 },
    );
  }

  const now = new Date();

  const updated = await db.$transaction(async (transaction) => {
    const next = await transaction.importValidationIssue.update({
      where: { id: issue.id },
      data: acknowledged
        ? {
            acknowledgedById: access.session.user.id,
            acknowledgedAt: now,
          }
        : {
            acknowledgedById: null,
            acknowledgedAt: null,
          },
      select: {
        id: true,
        acknowledgedAt: true,
        acknowledgedBy: {
          select: {
            displayName: true,
            email: true,
          },
        },
      },
    });

    await transaction.auditEvent.create({
      data: {
        userId: access.session.user.id,
        action: acknowledged
          ? "IMPORT_WARNING_ACKNOWLEDGED"
          : "IMPORT_WARNING_ACKNOWLEDGEMENT_REMOVED",
        entityType: "ImportValidationIssue",
        entityId: issue.id,
        metadata: {
          importBatchId: issue.importBatch.id,
          batchNumber: issue.importBatch.batchNumber,
          errorCode: issue.errorCode,
        },
      },
    });

    return next;
  });

  return Response.json({
    issue: {
      id: updated.id,
      acknowledgedAt: updated.acknowledgedAt?.toISOString() ?? null,
      acknowledgedBy:
        updated.acknowledgedBy?.displayName ??
        updated.acknowledgedBy?.email ??
        null,
    },
  });
}
