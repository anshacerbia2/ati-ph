import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  computeNotificationApprovalContentHash,
  notificationApprovalResourceKey,
  type NotificationApprovalHashJob,
} from "@/notifications/approval-rules";

const RESOURCE_TYPE = "NotificationPlan";

type ApprovalDatabase = Prisma.TransactionClient;

type ApprovalDecision = "APPROVE" | "REJECT";

export class NotificationApprovalError extends Error {
  constructor(
    public readonly code:
      | "NOTIFICATION_PLAN_NOT_COMMITTED"
      | "NOTIFICATION_APPROVAL_NOT_REQUIRED"
      | "NOTIFICATION_APPROVAL_ALREADY_PENDING"
      | "NOTIFICATION_APPROVAL_NOT_PENDING"
      | "NOTIFICATION_APPROVAL_CONTENT_CHANGED"
      | "NOTIFICATION_APPROVAL_MAKER_CHECKER"
      | "NOTIFICATION_APPROVAL_INVALID_DECISION",
    message: string,
    public readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "NotificationApprovalError";
  }
}

export async function getNotificationPlanApprovalState(
  occurrenceId: string,
  actorId: string,
) {
  const [occurrence, jobs, latestApproval] = await Promise.all([
    db.holidayOccurrence.findUnique({
      where: { id: occurrenceId },
      select: {
        id: true,
        notificationCommittedAt: true,
      },
    }),
    db.notificationJob.findMany({
      where: { holidayOccurrenceId: occurrenceId },
      select: { status: true },
    }),
    db.approvalRequest.findFirst({
      where: {
        resourceType: RESOURCE_TYPE,
        resourceId: occurrenceId,
      },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        status: true,
        requestedById: true,
        requestedAt: true,
        decidedAt: true,
        decisionReason: true,
      },
    }),
  ]);

  if (!occurrence?.notificationCommittedAt) {
    return {
      state: "NOT_COMMITTED" as const,
      counts: jobStatusCounts(jobs),
      approval: null,
      makerCheckerBlocked: false,
    };
  }

  const counts = jobStatusCounts(jobs);

  if (latestApproval?.status === "PENDING") {
    return {
      state: "PENDING" as const,
      counts,
      approval: latestApproval,
      makerCheckerBlocked:
        latestApproval.requestedById === actorId,
    };
  }

  if (latestApproval?.status === "APPROVED") {
    return {
      state: "APPROVED" as const,
      counts,
      approval: latestApproval,
      makerCheckerBlocked: false,
    };
  }

  if (latestApproval?.status === "REJECTED") {
    return {
      state: "REJECTED" as const,
      counts,
      approval: latestApproval,
      makerCheckerBlocked: false,
    };
  }

  if (counts.waitingApproval > 0) {
    return {
      state: "REQUIRED" as const,
      counts,
      approval: latestApproval,
      makerCheckerBlocked: false,
    };
  }

  return {
    state: "NOT_REQUIRED" as const,
    counts,
    approval: latestApproval,
    makerCheckerBlocked: false,
  };
}

export async function requestNotificationPlanApproval(
  occurrenceId: string,
  actorId: string,
) {
  return db.$transaction(async (tx) => {
    await lockApproval(tx, occurrenceId);

    const occurrence =
      await tx.holidayOccurrence.findUnique({
        where: { id: occurrenceId },
        select: { notificationCommittedAt: true },
      });

    if (!occurrence?.notificationCommittedAt) {
      throw new NotificationApprovalError(
        "NOTIFICATION_PLAN_NOT_COMMITTED",
        "Notification plan must be committed before approval can be requested.",
        occurrence ? 409 : 404,
      );
    }

    const existing =
      await tx.approvalRequest.findUnique({
        where: {
          activeResourceKey:
            notificationApprovalResourceKey(occurrenceId),
        },
        select: { id: true },
      });

    if (existing) {
      throw new NotificationApprovalError(
        "NOTIFICATION_APPROVAL_ALREADY_PENDING",
        "A notification approval request is already pending.",
        409,
      );
    }

    const created =
      await createNotificationPlanApprovalRequest(
        tx,
        occurrenceId,
        actorId,
      );

    if (!created) {
      throw new NotificationApprovalError(
        "NOTIFICATION_APPROVAL_NOT_REQUIRED",
        "This committed notification plan has no jobs waiting for approval.",
        409,
      );
    }

    return created;
  });
}

export async function createNotificationPlanApprovalRequest(
  tx: ApprovalDatabase,
  occurrenceId: string,
  actorId: string,
) {
  const jobs = await loadWaitingApprovalJobs(
    tx,
    occurrenceId,
  );

  if (jobs.length === 0) return null;

  const contentHash = approvalHashFor(jobs);
  const now = new Date();

  const created = await tx.approvalRequest.create({
    data: {
      resourceType: RESOURCE_TYPE,
      resourceId: occurrenceId,
      contentHash,
      activeResourceKey:
        notificationApprovalResourceKey(occurrenceId),
      requestedById: actorId,
    },
    select: {
      id: true,
      status: true,
      requestedAt: true,
    },
  });

  await tx.auditEvent.create({
    data: {
      userId: actorId,
      action: "NOTIFICATION_APPROVAL_REQUESTED",
      entityType: "ApprovalRequest",
      entityId: created.id,
      metadata: {
        occurrenceId,
        waitingApprovalCount: jobs.length,
        contentHash,
      },
    },
  });

  await tx.outboxEvent.create({
    data: {
      topic: "notification.approval.requested",
      aggregateType: "HolidayOccurrence",
      aggregateId: occurrenceId,
      payload: {
        eventVersion: 1,
        occurrenceId,
        approvalRequestId: created.id,
        waitingApprovalCount: jobs.length,
        contentHash,
        occurredAt: now.toISOString(),
      },
    },
  });

  return {
    approvalRequestId: created.id,
    status: created.status,
    requestedAt: created.requestedAt,
    waitingApprovalCount: jobs.length,
  };
}

export async function decideNotificationPlanApproval(
  occurrenceId: string,
  actorId: string,
  input: {
    decision: ApprovalDecision;
    reason: string;
  },
) {
  const reason = input.reason.trim();

  if (
    input.decision !== "APPROVE" &&
    input.decision !== "REJECT"
  ) {
    throw new NotificationApprovalError(
      "NOTIFICATION_APPROVAL_INVALID_DECISION",
      "decision must be APPROVE or REJECT.",
      400,
    );
  }

  if (
    input.decision === "REJECT" &&
    (reason.length < 5 || reason.length > 1000)
  ) {
    throw new NotificationApprovalError(
      "NOTIFICATION_APPROVAL_INVALID_DECISION",
      "Rejection reason must contain 5 to 1000 characters.",
      400,
    );
  }

  if (
    input.decision === "APPROVE" &&
    reason.length > 1000
  ) {
    throw new NotificationApprovalError(
      "NOTIFICATION_APPROVAL_INVALID_DECISION",
      "Decision note cannot exceed 1000 characters.",
      400,
    );
  }

  return db.$transaction(async (tx) => {
    await lockApproval(tx, occurrenceId);

    const approval =
      await tx.approvalRequest.findUnique({
        where: {
          activeResourceKey:
            notificationApprovalResourceKey(occurrenceId),
        },
        select: {
          id: true,
          status: true,
          contentHash: true,
          requestedById: true,
        },
      });

    if (!approval || approval.status !== "PENDING") {
      throw new NotificationApprovalError(
        "NOTIFICATION_APPROVAL_NOT_PENDING",
        "No pending notification approval request exists.",
        409,
      );
    }

    if (approval.requestedById === actorId) {
      throw new NotificationApprovalError(
        "NOTIFICATION_APPROVAL_MAKER_CHECKER",
        "Maker-checker requires a different approver.",
        409,
      );
    }

    const jobs = await loadWaitingApprovalJobs(
      tx,
      occurrenceId,
    );
    const currentHash = approvalHashFor(jobs);

    if (
      jobs.length === 0 ||
      currentHash !== approval.contentHash
    ) {
      throw new NotificationApprovalError(
        "NOTIFICATION_APPROVAL_CONTENT_CHANGED",
        "Frozen notification approval content no longer matches the requested snapshot.",
        409,
      );
    }

    const now = new Date();
    const approved = input.decision === "APPROVE";

    const transitioned = await tx.notificationJob.updateMany({
      where: {
        holidayOccurrenceId: occurrenceId,
        status: "WAITING_APPROVAL",
      },
      data: {
        status: approved ? "PLANNED" : "CANCELLED",
      },
    });

    await tx.approvalRequest.update({
      where: { id: approval.id },
      data: {
        status: approved ? "APPROVED" : "REJECTED",
        activeResourceKey: null,
        decidedById: actorId,
        decidedAt: now,
        decisionReason: reason || null,
      },
    });

    await tx.auditEvent.create({
      data: {
        userId: actorId,
        action: approved
          ? "NOTIFICATION_APPROVAL_APPROVED"
          : "NOTIFICATION_APPROVAL_REJECTED",
        entityType: "ApprovalRequest",
        entityId: approval.id,
        metadata: {
          occurrenceId,
          jobCount: transitioned.count,
          contentHash: approval.contentHash,
          decisionReason: reason || null,
          nextJobStatus: approved
            ? "PLANNED"
            : "CANCELLED",
        },
      },
    });

    await tx.outboxEvent.create({
      data: {
        topic: approved
          ? "notification.approval.approved"
          : "notification.approval.rejected",
        aggregateType: "HolidayOccurrence",
        aggregateId: occurrenceId,
        payload: {
          eventVersion: 1,
          occurrenceId,
          approvalRequestId: approval.id,
          jobCount: transitioned.count,
          reason: reason || null,
          occurredAt: now.toISOString(),
        },
      },
    });

    return {
      approvalRequestId: approval.id,
      status: approved ? "APPROVED" : "REJECTED",
      transitionedJobCount: transitioned.count,
      nextJobStatus: approved
        ? ("PLANNED" as const)
        : ("CANCELLED" as const),
    };
  });
}

async function lockApproval(
  tx: ApprovalDatabase,
  occurrenceId: string,
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtext(${occurrenceId}),
      hashtext('notification-plan-approval')
    )
  `;
}

async function loadWaitingApprovalJobs(
  tx: ApprovalDatabase,
  occurrenceId: string,
) {
  return tx.notificationJob.findMany({
    where: {
      holidayOccurrenceId: occurrenceId,
      status: "WAITING_APPROVAL",
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      idempotencyKey: true,
      notificationPolicyVersionId: true,
      notificationSchedulePolicyVersionId: true,
      scheduleSource: true,
      scheduleSourceVersion: true,
      targetHolidayDate: true,
      plannedLocalDate: true,
      plannedLocalTime: true,
      timezone: true,
      scheduledAt: true,
      approvalMode: true,
      recipientSnapshot: true,
      ruleSnapshot: true,
      contentSnapshot: true,
      contentSha256: true,
      automaticSendAllowed: true,
      retryCeiling: true,
    },
  });
}

function approvalHashFor(
  jobs: Awaited<
    ReturnType<typeof loadWaitingApprovalJobs>
  >,
): string {
  const hashJobs: NotificationApprovalHashJob[] =
    jobs.map((job) => {
      if (job.approvalMode !== "REQUIRED") {
        throw new NotificationApprovalError(
          "NOTIFICATION_APPROVAL_CONTENT_CHANGED",
          `Waiting approval job ${job.id} no longer has REQUIRED approval mode.`,
          409,
        );
      }

      return {
        id: job.id,
        idempotencyKey: job.idempotencyKey,
        notificationPolicyVersionId:
          job.notificationPolicyVersionId,
        notificationSchedulePolicyVersionId:
          job.notificationSchedulePolicyVersionId,
        scheduleSource: job.scheduleSource,
        scheduleSourceVersion: job.scheduleSourceVersion,
        targetHolidayDate:
          dateKey(job.targetHolidayDate),
        plannedLocalDate: dateKey(job.plannedLocalDate),
        plannedLocalTime: job.plannedLocalTime,
        timezone: job.timezone,
        scheduledAt: job.scheduledAt.toISOString(),
        approvalMode: "REQUIRED",
        recipientSnapshot: job.recipientSnapshot,
        ruleSnapshot: job.ruleSnapshot,
        contentSnapshot: job.contentSnapshot,
        contentSha256: job.contentSha256,
        automaticSendAllowed:
          job.automaticSendAllowed,
        retryCeiling: job.retryCeiling,
      };
    });

  return computeNotificationApprovalContentHash(
    hashJobs,
  );
}

function jobStatusCounts(
  jobs: readonly { status: string }[],
) {
  return {
    waitingApproval: jobs.filter(
      (job) => job.status === "WAITING_APPROVAL",
    ).length,
    planned: jobs.filter(
      (job) => job.status === "PLANNED",
    ).length,
    due: jobs.filter((job) => job.status === "DUE")
      .length,
    processing: jobs.filter(
      (job) => job.status === "PROCESSING",
    ).length,
    sent: jobs.filter((job) => job.status === "SENT")
      .length,
    failed: jobs.filter(
      (job) => job.status === "FAILED",
    ).length,
    cancelled: jobs.filter(
      (job) => job.status === "CANCELLED",
    ).length,
  };
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}
