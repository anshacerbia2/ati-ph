import {
  Prisma,
  PrismaClient,
} from "@prisma/client";

import {
  notificationDeliveryClaimEligibility,
} from "@/notifications/delivery-rules";

export class NotificationDeliveryError extends Error {
  constructor(
    public readonly code:
      | "DELIVERY_ATTEMPT_NOT_FOUND"
      | "DELIVERY_ATTEMPT_NOT_CLAIMED"
      | "DELIVERY_LEASE_EXPIRED"
      | "DELIVERY_RESULT_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "NotificationDeliveryError";
  }
}

export type NotificationDeliveryClaim = {
  attemptId: string;
  jobId: string;
  attemptNumber: number;
  leaseExpiresAt: Date;
  recipientSnapshot: Prisma.JsonValue;
  ruleSnapshot: Prisma.JsonValue;
  retryCeiling: number | null;
};

export async function claimDueNotificationJobs(
  database: PrismaClient,
  input: {
    now?: Date;
    batchSize: number;
    leaseSeconds: number;
  },
): Promise<NotificationDeliveryClaim[]> {
  const now = input.now ?? new Date();

  if (
    !Number.isInteger(input.batchSize) ||
    input.batchSize < 1 ||
    input.batchSize > 100
  ) {
    throw new Error(
      "Notification delivery batch size must be between 1 and 100.",
    );
  }

  if (
    !Number.isInteger(input.leaseSeconds) ||
    input.leaseSeconds < 30 ||
    input.leaseSeconds > 3600
  ) {
    throw new Error(
      "Notification delivery lease must be between 30 and 3600 seconds.",
    );
  }

  const leaseExpiresAt = new Date(
    now.getTime() + input.leaseSeconds * 1000,
  );

  return database.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >(
      Prisma.sql`
        SELECT job."id"
        FROM "notification"."notification_jobs" AS job
        WHERE job."status" =
          'DUE'::"notification"."NotificationJobStatus"
          AND job."automaticSendAllowed" = TRUE
        ORDER BY job."scheduledAt" ASC, job."id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${input.batchSize}
      `,
    );

    const claims: NotificationDeliveryClaim[] = [];

    for (const row of rows) {
      const job =
        await tx.notificationJob.findUniqueOrThrow({
          where: { id: row.id },
          select: {
            id: true,
            status: true,
            automaticSendAllowed: true,
            attemptCount: true,
            recipientSnapshot: true,
            ruleSnapshot: true,
            retryCeiling: true,
          },
        });

      const eligibility =
        notificationDeliveryClaimEligibility(job);

      if (!eligibility.ok) continue;

      const attemptNumber = job.attemptCount + 1;

      await tx.notificationJob.update({
        where: { id: job.id },
        data: {
          status: "PROCESSING",
          attemptCount: attemptNumber,
          failedAt: null,
          lastError: null,
        },
      });

      const attempt =
        await tx.notificationDeliveryAttempt.create({
          data: {
            notificationJobId: job.id,
            attemptNumber,
            status: "CLAIMED",
            claimedAt: now,
            leaseExpiresAt,
          },
          select: { id: true },
        });

      claims.push({
        attemptId: attempt.id,
        jobId: job.id,
        attemptNumber,
        leaseExpiresAt,
        recipientSnapshot: job.recipientSnapshot,
        ruleSnapshot: job.ruleSnapshot,
        retryCeiling: job.retryCeiling,
      });
    }

    if (claims.length > 0) {
      await tx.auditEvent.create({
        data: {
          userId: null,
          action:
            "NOTIFICATION_DELIVERY_JOBS_CLAIMED",
          entityType: "NotificationDeliveryWorker",
          entityId: null,
          metadata: {
            count: claims.length,
            attemptIds: claims.map(
              (claim) => claim.attemptId,
            ),
            jobIds: claims.map(
              (claim) => claim.jobId,
            ),
            claimedAt: now.toISOString(),
            leaseExpiresAt:
              leaseExpiresAt.toISOString(),
          },
        },
      });
    }

    return claims;
  });
}

export async function completeNotificationDeliveryAttempt(
  database: PrismaClient,
  input: {
    attemptId: string;
    now?: Date;
    outcome:
      | {
          status: "SENT";
          provider: string;
          providerMessageId?: string | null;
        }
      | {
          status: "FAILED";
          provider: string;
          errorCode?: string | null;
          errorMessage: string;
        };
  },
) {
  const now = input.now ?? new Date();

  if (
    !input.outcome.provider.trim() ||
    (input.outcome.status === "FAILED" &&
      !input.outcome.errorMessage.trim())
  ) {
    throw new NotificationDeliveryError(
      "DELIVERY_RESULT_INVALID",
      "Delivery result requires a provider and failed results require an error message.",
    );
  }

  return database.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<
      Array<{ id: string }>
    >(
      Prisma.sql`
        SELECT attempt."id"
        FROM "notification"."notification_delivery_attempts" AS attempt
        WHERE attempt."id" = ${input.attemptId}::uuid
        FOR UPDATE
      `,
    );

    if (locked.length === 0) {
      throw new NotificationDeliveryError(
        "DELIVERY_ATTEMPT_NOT_FOUND",
        "Notification delivery attempt was not found.",
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
            },
          },
        },
      });

    if (
      attempt.status !== "CLAIMED" ||
      attempt.notificationJob.status !== "PROCESSING"
    ) {
      throw new NotificationDeliveryError(
        "DELIVERY_ATTEMPT_NOT_CLAIMED",
        "Notification delivery attempt is no longer an active claim.",
      );
    }

    if (attempt.leaseExpiresAt.getTime() < now.getTime()) {
      throw new NotificationDeliveryError(
        "DELIVERY_LEASE_EXPIRED",
        "Notification delivery claim lease has expired.",
      );
    }

    if (input.outcome.status === "SENT") {
      const provider = input.outcome.provider.trim();

      await tx.notificationDeliveryAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "SENT",
          completedAt: now,
          provider,
          providerMessageId:
            input.outcome.providerMessageId?.trim() ||
            null,
        },
      });

      await tx.notificationJob.update({
        where: { id: attempt.notificationJob.id },
        data: {
          status: "SENT",
          sentAt: now,
          failedAt: null,
          lastError: null,
        },
      });

      await tx.auditEvent.create({
        data: {
          userId: null,
          action: "NOTIFICATION_DELIVERY_SENT",
          entityType: "NotificationDeliveryAttempt",
          entityId: attempt.id,
          metadata: {
            jobId: attempt.notificationJob.id,
            attemptNumber: attempt.attemptNumber,
            provider,
            completedAt: now.toISOString(),
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          topic: "notification.delivery.sent",
          aggregateType: "NotificationJob",
          aggregateId: attempt.notificationJob.id,
          payload: {
            eventVersion: 1,
            jobId: attempt.notificationJob.id,
            attemptId: attempt.id,
            attemptNumber: attempt.attemptNumber,
            provider,
            occurredAt: now.toISOString(),
          },
        },
      });

      return {
        attemptId: attempt.id,
        jobId: attempt.notificationJob.id,
        status: "SENT" as const,
      };
    }

    const provider = input.outcome.provider.trim();
    const errorMessage = input.outcome.errorMessage.trim();

    await tx.notificationDeliveryAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "FAILED",
        completedAt: now,
        provider,
        errorCode:
          input.outcome.errorCode?.trim() || null,
        errorMessage,
      },
    });

    await tx.notificationJob.update({
      where: { id: attempt.notificationJob.id },
      data: {
        status: "FAILED",
        failedAt: now,
        lastError: errorMessage,
      },
    });

    await tx.auditEvent.create({
      data: {
        userId: null,
        action: "NOTIFICATION_DELIVERY_FAILED",
        entityType: "NotificationDeliveryAttempt",
        entityId: attempt.id,
        metadata: {
          jobId: attempt.notificationJob.id,
          attemptNumber: attempt.attemptNumber,
          provider,
          completedAt: now.toISOString(),
        },
      },
    });

    await tx.outboxEvent.create({
      data: {
        topic: "notification.delivery.failed",
        aggregateType: "NotificationJob",
        aggregateId: attempt.notificationJob.id,
        payload: {
          eventVersion: 1,
          jobId: attempt.notificationJob.id,
          attemptId: attempt.id,
          attemptNumber: attempt.attemptNumber,
          provider,
          occurredAt: now.toISOString(),
        },
      },
    });

    return {
      attemptId: attempt.id,
      jobId: attempt.notificationJob.id,
      status: "FAILED" as const,
    };
  });
}
