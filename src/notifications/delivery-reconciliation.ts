import {
  Prisma,
  PrismaClient,
} from "@prisma/client";

import {
  notificationDeliveryReconciliationEligibility,
  type NotificationDeliveryReconciliationAction,
} from "@/notifications/delivery-reconciliation-rules";

export class NotificationDeliveryReconciliationError extends Error {
  constructor(
    public readonly code:
      | "DELIVERY_RECONCILIATION_NOT_FOUND"
      | "DELIVERY_RECONCILIATION_INVALID_INPUT"
      | "DELIVERY_RECONCILIATION_NOT_ALLOWED",
    message: string,
    public readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "NotificationDeliveryReconciliationError";
  }
}

export async function listNotificationDeliveryReconciliationQueue(
  database: PrismaClient,
  input: { limit?: number } = {},
) {
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new NotificationDeliveryReconciliationError(
      "DELIVERY_RECONCILIATION_INVALID_INPUT",
      "Reconciliation queue limit must be between 1 and 200.",
      400,
    );
  }

  const attempts = await database.notificationDeliveryAttempt.findMany({
    where: {
      status: "FAILED",
      failureClass: "OUTCOME_UNKNOWN",
      reconciliationAction: null,
      notificationJob: {
        status: "FAILED",
      },
    },
    orderBy: [
      { completedAt: "asc" },
      { id: "asc" },
    ],
    take: limit,
    select: {
      id: true,
      attemptNumber: true,
      provider: true,
      providerMessageId: true,
      acceptedRecipients: true,
      rejectedRecipients: true,
      errorCode: true,
      errorMessage: true,
      completedAt: true,
      createdAt: true,
      notificationJob: {
        select: {
          id: true,
          status: true,
          attemptCount: true,
          scheduledAt: true,
          recipientSnapshot: true,
          occurrence: {
            select: {
              startDate: true,
              endDate: true,
              definition: {
                select: {
                  canonicalName: true,
                },
              },
            },
          },
          subscription: {
            select: {
              serviceTeam: {
                select: {
                  name: true,
                  client: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  return {
    count: attempts.length,
    attempts: attempts.map((attempt) => ({
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      provider: attempt.provider,
      providerMessageId: attempt.providerMessageId,
      acceptedRecipients: attempt.acceptedRecipients,
      rejectedRecipients: attempt.rejectedRecipients,
      errorCode: attempt.errorCode,
      errorMessage: attempt.errorMessage,
      completedAt: attempt.completedAt,
      createdAt: attempt.createdAt,
      job: {
        id: attempt.notificationJob.id,
        status: attempt.notificationJob.status,
        attemptCount: attempt.notificationJob.attemptCount,
        scheduledAt: attempt.notificationJob.scheduledAt,
        recipientSnapshot: attempt.notificationJob.recipientSnapshot,
      },
      holiday: {
        name:
          attempt.notificationJob.occurrence.definition.canonicalName,
        startDate:
          attempt.notificationJob.occurrence.startDate,
        endDate:
          attempt.notificationJob.occurrence.endDate,
      },
      client: {
        name:
          attempt.notificationJob.subscription.serviceTeam.client.name,
        serviceTeamName:
          attempt.notificationJob.subscription.serviceTeam.name,
      },
    })),
  };
}

export async function reconcileNotificationDeliveryAttempt(
  database: PrismaClient,
  input: {
    attemptId: string;
    userId: string;
    action: NotificationDeliveryReconciliationAction;
    note: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const note = input.note.trim();

  if (!input.attemptId.trim() || !input.userId.trim()) {
    throw new NotificationDeliveryReconciliationError(
      "DELIVERY_RECONCILIATION_INVALID_INPUT",
      "Reconciliation requires an attempt and actor.",
      400,
    );
  }

  if (note.length < 5 || note.length > 1000) {
    throw new NotificationDeliveryReconciliationError(
      "DELIVERY_RECONCILIATION_INVALID_INPUT",
      "Reconciliation note must be between 5 and 1000 characters.",
      400,
    );
  }

  return database.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT attempt."id"
        FROM "notification"."notification_delivery_attempts" AS attempt
        WHERE attempt."id" = ${input.attemptId}::uuid
        FOR UPDATE
      `,
    );

    if (locked.length === 0) {
      throw new NotificationDeliveryReconciliationError(
        "DELIVERY_RECONCILIATION_NOT_FOUND",
        "Notification delivery attempt was not found.",
        404,
      );
    }

    const attempt =
      await tx.notificationDeliveryAttempt.findUniqueOrThrow({
        where: { id: input.attemptId },
        include: {
          notificationJob: {
            select: {
              id: true,
              status: true,
              attemptCount: true,
              failedAt: true,
            },
          },
        },
      });

    const eligibility =
      notificationDeliveryReconciliationEligibility({
        action: input.action,
        attemptStatus: attempt.status,
        failureClass: attempt.failureClass,
        reconciliationAction:
          attempt.reconciliationAction,
        attemptNumber: attempt.attemptNumber,
        jobAttemptCount:
          attempt.notificationJob.attemptCount,
        jobStatus:
          attempt.notificationJob.status,
      });

    if (!eligibility.ok) {
      throw new NotificationDeliveryReconciliationError(
        "DELIVERY_RECONCILIATION_NOT_ALLOWED",
        eligibility.reason,
        409,
      );
    }

    await tx.notificationDeliveryAttempt.update({
      where: { id: attempt.id },
      data: {
        reconciliationAction: input.action,
        reconciliationNote: note,
        reconciledAt: now,
        reconciledById: input.userId,
      },
    });

    if (input.action === "MARK_SENT") {
      await tx.notificationJob.update({
        where: { id: attempt.notificationJob.id },
        data: {
          status: "SENT",
          retryAt: null,
          sentAt: now,
          failedAt: null,
          lastError: null,
        },
      });
    } else if (input.action === "RETRY") {
      await tx.notificationJob.update({
        where: { id: attempt.notificationJob.id },
        data: {
          status: "DUE",
          retryAt: null,
          sentAt: null,
          failedAt: null,
          lastError: null,
        },
      });
    } else {
      await tx.notificationJob.update({
        where: { id: attempt.notificationJob.id },
        data: {
          status: "FAILED",
          retryAt: null,
          failedAt:
            attempt.notificationJob.failedAt ?? now,
          lastError:
            `Manually reconciled as failed: ${note}`,
        },
      });
    }

    await tx.auditEvent.create({
      data: {
        userId: input.userId,
        action: "NOTIFICATION_DELIVERY_RECONCILED",
        entityType: "NotificationDeliveryAttempt",
        entityId: attempt.id,
        metadata: {
          jobId: attempt.notificationJob.id,
          attemptNumber: attempt.attemptNumber,
          action: input.action,
          note,
          reconciledAt: now.toISOString(),
        },
      },
    });

    await tx.outboxEvent.create({
      data: {
        topic: "notification.delivery.reconciled",
        aggregateType: "NotificationJob",
        aggregateId: attempt.notificationJob.id,
        payload: {
          eventVersion: 1,
          jobId: attempt.notificationJob.id,
          attemptId: attempt.id,
          attemptNumber: attempt.attemptNumber,
          action: input.action,
          reconciledById: input.userId,
          occurredAt: now.toISOString(),
        },
      },
    });

    return {
      attemptId: attempt.id,
      jobId: attempt.notificationJob.id,
      action: input.action,
      reconciledAt: now,
      jobStatus:
        input.action === "MARK_SENT"
          ? ("SENT" as const)
          : input.action === "RETRY"
            ? ("DUE" as const)
            : ("FAILED" as const),
    };
  });
}
