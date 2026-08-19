import {
  Prisma,
  PrismaClient,
} from "@prisma/client";

import {
  notificationDeliveryClaimEligibility,
  notificationDeliveryRetryDecision,
  type NotificationDeliveryFailureClass,
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
  idempotencyKey: string;
  recipientSnapshot: Prisma.JsonValue;
  ruleSnapshot: Prisma.JsonValue;
  contentSnapshot: Prisma.JsonValue | null;
  contentSha256: string | null;
  retryCeiling: number | null;
};

export async function claimDueNotificationJobs(
  database: PrismaClient,
  input: {
    now?: Date;
    batchSize: number;
    leaseSeconds: number;
    provider: string;
    leaseRetrySafe: boolean;
  },
): Promise<NotificationDeliveryClaim[]> {
  const now = input.now ?? new Date();
  const provider = input.provider.trim();

  validateBatchSize(input.batchSize);

  if (
    !Number.isInteger(input.leaseSeconds) ||
    input.leaseSeconds < 30 ||
    input.leaseSeconds > 3600
  ) {
    throw new Error(
      "Notification delivery lease must be between 30 and 3600 seconds.",
    );
  }

  if (!provider) {
    throw new NotificationDeliveryError(
      "DELIVERY_RESULT_INVALID",
      "Notification delivery claim requires a provider/transport code.",
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
            idempotencyKey: true,
            recipientSnapshot: true,
            ruleSnapshot: true,
            contentSnapshot: true,
            contentSha256: true,
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
          retryAt: null,
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
            provider,
            leaseRetrySafe:
              input.leaseRetrySafe,
          },
          select: { id: true },
        });

      claims.push({
        attemptId: attempt.id,
        jobId: job.id,
        attemptNumber,
        leaseExpiresAt,
        idempotencyKey: job.idempotencyKey,
        recipientSnapshot: job.recipientSnapshot,
        ruleSnapshot: job.ruleSnapshot,
        contentSnapshot: job.contentSnapshot,
        contentSha256: job.contentSha256,
        retryCeiling: job.retryCeiling,
      });
    }

    if (claims.length > 0) {
      await tx.auditEvent.create({
        data: {
          userId: null,
          action:
            "NOTIFICATION_DELIVERY_JOBS_CLAIMED",
          entityType:
            "NotificationDeliveryWorker",
          entityId: null,
          metadata: {
            count: claims.length,
            attemptIds: claims.map(
              (claim) => claim.attemptId,
            ),
            jobIds: claims.map(
              (claim) => claim.jobId,
            ),
            provider,
            leaseRetrySafe:
              input.leaseRetrySafe,
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

export async function promoteRetryableNotificationJobs(
  database: PrismaClient,
  input: {
    now?: Date;
    batchSize: number;
  },
): Promise<{
  count: number;
  jobIds: string[];
}> {
  const now = input.now ?? new Date();
  validateBatchSize(input.batchSize);

  return database.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >(
      Prisma.sql`
        SELECT job."id"
        FROM "notification"."notification_jobs" AS job
        WHERE job."status" =
          'RETRY_WAIT'::"notification"."NotificationJobStatus"
          AND job."retryAt" <= ${now}
          AND job."automaticSendAllowed" = TRUE
        ORDER BY job."retryAt" ASC, job."id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${input.batchSize}
      `,
    );

    const jobIds = rows.map((row) => row.id);

    if (jobIds.length === 0) {
      return { count: 0, jobIds: [] };
    }

    await tx.notificationJob.updateMany({
      where: {
        id: { in: jobIds },
        status: "RETRY_WAIT",
      },
      data: {
        status: "DUE",
        retryAt: null,
      },
    });

    await tx.auditEvent.create({
      data: {
        userId: null,
        action:
          "NOTIFICATION_DELIVERY_RETRIES_DUE",
        entityType:
          "NotificationDeliveryWorker",
        entityId: null,
        metadata: {
          count: jobIds.length,
          jobIds,
          promotedAt: now.toISOString(),
        },
      },
    });

    return {
      count: jobIds.length,
      jobIds,
    };
  });
}

export async function recoverExpiredNotificationDeliveryClaims(
  database: PrismaClient,
  input: {
    now?: Date;
    batchSize: number;
  },
): Promise<{
  count: number;
  retryScheduledCount: number;
  terminalFailureCount: number;
  attemptIds: string[];
  jobIds: string[];
}> {
  const now = input.now ?? new Date();
  validateBatchSize(input.batchSize);

  return database.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >(
      Prisma.sql`
        SELECT attempt."id"
        FROM "notification"."notification_delivery_attempts" AS attempt
        INNER JOIN "notification"."notification_jobs" AS job
          ON job."id" = attempt."notificationJobId"
        WHERE attempt."status" =
          'CLAIMED'::"notification"."NotificationDeliveryAttemptStatus"
          AND attempt."leaseExpiresAt" <= ${now}
          AND job."status" =
            'PROCESSING'::"notification"."NotificationJobStatus"
        ORDER BY attempt."leaseExpiresAt" ASC, attempt."id" ASC
        FOR UPDATE OF attempt SKIP LOCKED
        LIMIT ${input.batchSize}
      `,
    );

    const results: Array<{
      attemptId: string;
      jobId: string;
      status: "RETRY_WAIT" | "FAILED";
    }> = [];

    for (const row of rows) {
      const attempt =
        await tx.notificationDeliveryAttempt.findUniqueOrThrow({
          where: { id: row.id },
          include: {
            notificationJob: {
              select: {
                id: true,
                status: true,
                retryCeiling: true,
              },
            },
          },
        });

      if (
        attempt.status !== "CLAIMED" ||
        attempt.notificationJob.status !==
          "PROCESSING"
      ) {
        continue;
      }

      const retrySafe =
        attempt.leaseRetrySafe === true;
      const failureClass:
        NotificationDeliveryFailureClass =
        retrySafe
          ? "RETRYABLE"
          : "OUTCOME_UNKNOWN";

      const failure =
        retrySafe
          ? {
              errorCode:
                "DELIVERY_LEASE_EXPIRED_RETRY_SAFE",
              errorMessage:
                "Delivery worker lease expired before completion; the claimed transport is marked retry-safe after lease expiry.",
            }
          : {
              errorCode:
                "DELIVERY_OUTCOME_UNKNOWN_AFTER_LEASE",
              errorMessage:
                "Delivery worker lease expired after an external side effect may have occurred. Automatic retry is blocked to avoid duplicate delivery.",
            };

      const result = await failClaimedAttempt(
        tx,
        {
          attempt,
          now,
          provider:
            attempt.provider?.trim() ||
            "UNKNOWN",
          failureClass,
          errorCode: failure.errorCode,
          errorMessage:
            failure.errorMessage,
        },
      );

      results.push(result);
    }

    return {
      count: results.length,
      retryScheduledCount: results.filter(
        (result) =>
          result.status === "RETRY_WAIT",
      ).length,
      terminalFailureCount: results.filter(
        (result) =>
          result.status === "FAILED",
      ).length,
      attemptIds: results.map(
        (result) => result.attemptId,
      ),
      jobIds: results.map(
        (result) => result.jobId,
      ),
    };
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
          failureClass:
            NotificationDeliveryFailureClass;
          errorCode?: string | null;
          errorMessage: string;
        };
  },
) {
  const now = input.now ?? new Date();
  const provider = input.outcome.provider.trim();

  if (
    !provider ||
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
              retryCeiling: true,
            },
          },
        },
      });

    if (
      attempt.status !== "CLAIMED" ||
      attempt.notificationJob.status !==
        "PROCESSING"
    ) {
      throw new NotificationDeliveryError(
        "DELIVERY_ATTEMPT_NOT_CLAIMED",
        "Notification delivery attempt is no longer an active claim.",
      );
    }

    if (
      attempt.leaseExpiresAt.getTime() <=
      now.getTime()
    ) {
      throw new NotificationDeliveryError(
        "DELIVERY_LEASE_EXPIRED",
        "Notification delivery claim lease has expired.",
      );
    }

    const claimedProvider =
      attempt.provider?.trim();

    if (
      claimedProvider &&
      claimedProvider !== provider
    ) {
      throw new NotificationDeliveryError(
        "DELIVERY_RESULT_INVALID",
        `Delivery completion provider ${provider} does not match claimed provider ${claimedProvider}.`,
      );
    }

    if (input.outcome.status === "SENT") {
      await tx.notificationDeliveryAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "SENT",
          completedAt: now,
          provider,
          providerMessageId:
            input.outcome.providerMessageId?.trim() ||
            null,
          failureClass: null,
          errorCode: null,
          errorMessage: null,
        },
      });

      await tx.notificationJob.update({
        where: {
          id: attempt.notificationJob.id,
        },
        data: {
          status: "SENT",
          retryAt: null,
          sentAt: now,
          failedAt: null,
          lastError: null,
        },
      });

      await tx.auditEvent.create({
        data: {
          userId: null,
          action:
            "NOTIFICATION_DELIVERY_SENT",
          entityType:
            "NotificationDeliveryAttempt",
          entityId: attempt.id,
          metadata: {
            jobId:
              attempt.notificationJob.id,
            attemptNumber:
              attempt.attemptNumber,
            provider,
            completedAt: now.toISOString(),
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          topic:
            "notification.delivery.sent",
          aggregateType:
            "NotificationJob",
          aggregateId:
            attempt.notificationJob.id,
          payload: {
            eventVersion: 1,
            jobId:
              attempt.notificationJob.id,
            attemptId: attempt.id,
            attemptNumber:
              attempt.attemptNumber,
            provider,
            occurredAt: now.toISOString(),
          },
        },
      });

      return {
        attemptId: attempt.id,
        jobId:
          attempt.notificationJob.id,
        status: "SENT" as const,
        retryAt: null,
      };
    }

    return failClaimedAttempt(tx, {
      attempt,
      now,
      provider,
      failureClass:
        input.outcome.failureClass,
      errorCode:
        input.outcome.errorCode?.trim() ||
        null,
      errorMessage:
        input.outcome.errorMessage.trim(),
    });
  });
}

type ClaimedAttempt = {
  id: string;
  attemptNumber: number;
  provider: string | null;
  leaseRetrySafe: boolean;
  notificationJob: {
    id: string;
    status:
      | "WAITING_APPROVAL"
      | "PLANNED"
      | "DUE"
      | "PROCESSING"
      | "RETRY_WAIT"
      | "SENT"
      | "FAILED"
      | "CANCELLED";
    retryCeiling: number | null;
  };
};

async function failClaimedAttempt(
  tx: Prisma.TransactionClient,
  input: {
    attempt: ClaimedAttempt;
    now: Date;
    provider: string;
    failureClass:
      NotificationDeliveryFailureClass;
    errorCode: string | null;
    errorMessage: string;
  },
): Promise<{
  attemptId: string;
  jobId: string;
  status: "RETRY_WAIT" | "FAILED";
  retryAt: Date | null;
}> {
  const decision =
    notificationDeliveryRetryDecision({
      failureClass: input.failureClass,
      attemptNumber:
        input.attempt.attemptNumber,
      retryCeiling:
        input.attempt.notificationJob
          .retryCeiling,
      now: input.now,
    });

  await tx.notificationDeliveryAttempt.update({
    where: { id: input.attempt.id },
    data: {
      status: "FAILED",
      completedAt: input.now,
      provider: input.provider,
      failureClass: input.failureClass,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    },
  });

  if (decision.action === "RETRY") {
    await tx.notificationJob.update({
      where: {
        id: input.attempt.notificationJob.id,
      },
      data: {
        status: "RETRY_WAIT",
        retryAt: decision.retryAt,
        failedAt: null,
        lastError: input.errorMessage,
      },
    });

    await tx.auditEvent.create({
      data: {
        userId: null,
        action:
          "NOTIFICATION_DELIVERY_RETRY_SCHEDULED",
        entityType:
          "NotificationDeliveryAttempt",
        entityId: input.attempt.id,
        metadata: {
          jobId:
            input.attempt.notificationJob.id,
          attemptNumber:
            input.attempt.attemptNumber,
          provider: input.provider,
          failureClass:
            input.failureClass,
          retryNumber:
            decision.retryNumber,
          retryAt:
            decision.retryAt.toISOString(),
          delaySeconds:
            decision.delaySeconds,
          remainingRetries:
            decision.remainingRetries,
          retryCeiling:
            decision.retryCeiling,
        },
      },
    });

    await tx.outboxEvent.create({
      data: {
        topic:
          "notification.delivery.retry_scheduled",
        aggregateType:
          "NotificationJob",
        aggregateId:
          input.attempt.notificationJob.id,
        payload: {
          eventVersion: 1,
          jobId:
            input.attempt.notificationJob.id,
          attemptId: input.attempt.id,
          attemptNumber:
            input.attempt.attemptNumber,
          provider: input.provider,
          failureClass:
            input.failureClass,
          retryNumber:
            decision.retryNumber,
          retryAt:
            decision.retryAt.toISOString(),
          occurredAt:
            input.now.toISOString(),
        },
      },
    });

    return {
      attemptId: input.attempt.id,
      jobId:
        input.attempt.notificationJob.id,
      status: "RETRY_WAIT",
      retryAt: decision.retryAt,
    };
  }

  await tx.notificationJob.update({
    where: {
      id: input.attempt.notificationJob.id,
    },
    data: {
      status: "FAILED",
      retryAt: null,
      failedAt: input.now,
      lastError: input.errorMessage,
    },
  });

  await tx.auditEvent.create({
    data: {
      userId: null,
      action:
        "NOTIFICATION_DELIVERY_FAILED",
      entityType:
        "NotificationDeliveryAttempt",
      entityId: input.attempt.id,
      metadata: {
        jobId:
          input.attempt.notificationJob.id,
        attemptNumber:
          input.attempt.attemptNumber,
        provider: input.provider,
        failureClass:
          input.failureClass,
        terminalReason: decision.reason,
        retryCeiling:
          decision.retryCeiling,
        retriesUsed:
          decision.retriesUsed,
        completedAt:
          input.now.toISOString(),
      },
    },
  });

  await tx.outboxEvent.create({
    data: {
      topic:
        "notification.delivery.failed",
      aggregateType: "NotificationJob",
      aggregateId:
        input.attempt.notificationJob.id,
      payload: {
        eventVersion: 1,
        jobId:
          input.attempt.notificationJob.id,
        attemptId: input.attempt.id,
        attemptNumber:
          input.attempt.attemptNumber,
        provider: input.provider,
        failureClass:
          input.failureClass,
        terminalReason: decision.reason,
        occurredAt:
          input.now.toISOString(),
      },
    },
  });

  return {
    attemptId: input.attempt.id,
    jobId:
      input.attempt.notificationJob.id,
    status: "FAILED",
    retryAt: null,
  };
}

function validateBatchSize(batchSize: number) {
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > 100
  ) {
    throw new Error(
      "Notification delivery batch size must be between 1 and 100.",
    );
  }
}
