import {
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import {
  schedulerLagCutoff,
} from "@/notifications/trusted-automation-rules";

export type NotificationOperationalAlertTypeValue =
  | "PLANNING_BLOCKED"
  | "ZERO_RECIPIENT"
  | "SCHEDULER_LAG"
  | "DELIVERY_FAILURE";

export type NotificationOperationalAlertSeverityValue =
  | "WARNING"
  | "CRITICAL";

type AlertDatabase = Pick<
  PrismaClient,
  "notificationOperationalAlert"
>;

export async function upsertNotificationOperationalAlert(
  database: AlertDatabase,
  input: {
    alertKey: string;
    type: NotificationOperationalAlertTypeValue;
    severity: NotificationOperationalAlertSeverityValue;
    summary: string;
    holidayOccurrenceId?: string | null;
    notificationJobId?: string | null;
    details?: Prisma.InputJsonValue;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();

  return database.notificationOperationalAlert.upsert({
    where: { alertKey: input.alertKey },
    create: {
      alertKey: input.alertKey,
      type: input.type,
      severity: input.severity,
      status: "OPEN",
      holidayOccurrenceId:
        input.holidayOccurrenceId ?? null,
      notificationJobId:
        input.notificationJobId ?? null,
      summary: input.summary,
      details: input.details,
      firstDetectedAt: now,
      lastDetectedAt: now,
      resolvedAt: null,
    },
    update: {
      type: input.type,
      severity: input.severity,
      status: "OPEN",
      holidayOccurrenceId:
        input.holidayOccurrenceId ?? null,
      notificationJobId:
        input.notificationJobId ?? null,
      summary: input.summary,
      details: input.details,
      lastDetectedAt: now,
      resolvedAt: null,
    },
  });
}

export async function resolveNotificationOperationalAlerts(
  database: AlertDatabase,
  input: {
    holidayOccurrenceId?: string;
    notificationJobId?: string;
    types?: NotificationOperationalAlertTypeValue[];
    excludeAlertKeys?: string[];
    now?: Date;
  },
) {
  const now = input.now ?? new Date();

  return database.notificationOperationalAlert.updateMany({
    where: {
      status: "OPEN",
      ...(input.holidayOccurrenceId
        ? {
            holidayOccurrenceId:
              input.holidayOccurrenceId,
          }
        : {}),
      ...(input.notificationJobId
        ? {
            notificationJobId:
              input.notificationJobId,
          }
        : {}),
      ...(input.types?.length
        ? { type: { in: input.types } }
        : {}),
      ...(input.excludeAlertKeys?.length
        ? {
            alertKey: {
              notIn: input.excludeAlertKeys,
            },
          }
        : {}),
    },
    data: {
      status: "RESOLVED",
      resolvedAt: now,
    },
  });
}

export async function syncSchedulerLagAlerts(
  database: PrismaClient,
  input: {
    now?: Date;
    thresholdSeconds: number;
    batchSize: number;
  },
) {
  validateBatchSize(input.batchSize);
  const now = input.now ?? new Date();
  const cutoff = schedulerLagCutoff(
    now,
    input.thresholdSeconds,
  );

  const tracked =
    await database.notificationOperationalAlert.findMany({
      where: {
        type: "SCHEDULER_LAG",
        status: "OPEN",
      },
      orderBy: { lastDetectedAt: "asc" },
      take: input.batchSize,
      select: {
        id: true,
        notificationJobId: true,
      },
    });

  const trackedJobIds = tracked
    .map((alert) => alert.notificationJobId)
    .filter(
      (jobId): jobId is string =>
        typeof jobId === "string",
    );
  const trackedJobs =
    trackedJobIds.length > 0
      ? await database.notificationJob.findMany({
          where: { id: { in: trackedJobIds } },
          select: {
            id: true,
            status: true,
            scheduledAt: true,
          },
        })
      : [];
  const trackedById = new Map(
    trackedJobs.map((job) => [job.id, job]),
  );

  let resolvedCount = 0;
  for (const alert of tracked) {
    const job = alert.notificationJobId
      ? trackedById.get(alert.notificationJobId)
      : null;

    if (
      !job ||
      job.status !== "PLANNED" ||
      job.scheduledAt.getTime() >
        cutoff.getTime()
    ) {
      await database.notificationOperationalAlert.update({
        where: { id: alert.id },
        data: {
          status: "RESOLVED",
          resolvedAt: now,
        },
      });
      resolvedCount += 1;
    }
  }

  const lagging =
    await database.notificationJob.findMany({
      where: {
        status: "PLANNED",
        scheduledAt: { lte: cutoff },
      },
      orderBy: [
        { scheduledAt: "asc" },
        { id: "asc" },
      ],
      take: input.batchSize,
      select: {
        id: true,
        scheduledAt: true,
        occurrence: {
          select: {
            id: true,
            startDate: true,
            definition: {
              select: { canonicalName: true },
            },
          },
        },
        subscription: {
          select: {
            serviceTeam: {
              select: {
                name: true,
                client: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
    });

  for (const job of lagging) {
    await upsertNotificationOperationalAlert(
      database,
      {
        alertKey: `scheduler-lag:${job.id}`,
        type: "SCHEDULER_LAG",
        severity: "WARNING",
        holidayOccurrenceId:
          job.occurrence.id,
        notificationJobId: job.id,
        summary:
          `Scheduler lag: ${job.subscription.serviceTeam.client.name} · ${job.occurrence.definition.canonicalName}`,
        details: {
          scheduledAt:
            job.scheduledAt.toISOString(),
          cutoff: cutoff.toISOString(),
          serviceTeam:
            job.subscription.serviceTeam.name,
        },
        now,
      },
    );
  }

  return {
    detectedCount: lagging.length,
    resolvedCount,
    cutoff,
  };
}

export async function syncDeliveryFailureAlerts(
  database: PrismaClient,
  input: {
    now?: Date;
    batchSize: number;
  },
) {
  validateBatchSize(input.batchSize);
  const now = input.now ?? new Date();

  const tracked =
    await database.notificationOperationalAlert.findMany({
      where: {
        type: "DELIVERY_FAILURE",
        status: "OPEN",
      },
      orderBy: { lastDetectedAt: "asc" },
      take: input.batchSize,
      select: {
        id: true,
        notificationJobId: true,
      },
    });
  const trackedJobIds = tracked
    .map((alert) => alert.notificationJobId)
    .filter(
      (jobId): jobId is string =>
        typeof jobId === "string",
    );
  const trackedJobs =
    trackedJobIds.length > 0
      ? await database.notificationJob.findMany({
          where: { id: { in: trackedJobIds } },
          select: {
            id: true,
            status: true,
          },
        })
      : [];
  const trackedById = new Map(
    trackedJobs.map((job) => [job.id, job]),
  );

  let resolvedCount = 0;
  for (const alert of tracked) {
    const job = alert.notificationJobId
      ? trackedById.get(alert.notificationJobId)
      : null;
    if (!job || job.status !== "FAILED") {
      await database.notificationOperationalAlert.update({
        where: { id: alert.id },
        data: {
          status: "RESOLVED",
          resolvedAt: now,
        },
      });
      resolvedCount += 1;
    }
  }

  const failed =
    await database.notificationJob.findMany({
      where: { status: "FAILED" },
      orderBy: [
        { failedAt: "desc" },
        { id: "asc" },
      ],
      take: input.batchSize,
      select: {
        id: true,
        failedAt: true,
        lastError: true,
        occurrence: {
          select: {
            id: true,
            definition: {
              select: { canonicalName: true },
            },
          },
        },
        subscription: {
          select: {
            serviceTeam: {
              select: {
                name: true,
                client: {
                  select: { name: true },
                },
              },
            },
          },
        },
        deliveryAttempts: {
          orderBy: { attemptNumber: "desc" },
          take: 1,
          select: {
            attemptNumber: true,
            failureClass: true,
            errorCode: true,
            errorMessage: true,
          },
        },
      },
    });

  for (const job of failed) {
    const latest = job.deliveryAttempts[0] ?? null;
    await upsertNotificationOperationalAlert(
      database,
      {
        alertKey: `delivery-failure:${job.id}`,
        type: "DELIVERY_FAILURE",
        severity:
          latest?.failureClass ===
          "OUTCOME_UNKNOWN"
            ? "CRITICAL"
            : "WARNING",
        holidayOccurrenceId:
          job.occurrence.id,
        notificationJobId: job.id,
        summary:
          `Delivery failed: ${job.subscription.serviceTeam.client.name} · ${job.occurrence.definition.canonicalName}`,
        details: {
          failedAt:
            job.failedAt?.toISOString() ?? null,
          lastError: job.lastError,
          serviceTeam:
            job.subscription.serviceTeam.name,
          attemptNumber:
            latest?.attemptNumber ?? null,
          failureClass:
            latest?.failureClass ?? null,
          errorCode: latest?.errorCode ?? null,
          errorMessage:
            latest?.errorMessage ?? null,
        },
        now,
      },
    );
  }

  return {
    detectedCount: failed.length,
    resolvedCount,
  };
}

function validateBatchSize(
  batchSize: number,
): void {
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > 1000
  ) {
    throw new Error(
      "Operational alert batch size must be between 1 and 1000.",
    );
  }
}
