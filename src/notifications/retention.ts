import type {
  PrismaClient,
} from "@prisma/client";

export async function runNotificationOperationalRetention(
  database: PrismaClient,
  input: {
    enabled: boolean;
    now?: Date;
    alertRetentionDays: number;
    batchSize: number;
  },
) {
  validateInput(input);

  if (!input.enabled) {
    return {
      enabled: false,
      deletedResolvedAlertCount: 0,
    };
  }

  const now = input.now ?? new Date();
  const cutoff = new Date(
    now.getTime() -
      input.alertRetentionDays *
        86_400_000,
  );

  const candidates =
    await database.notificationOperationalAlert.findMany({
      where: {
        status: "RESOLVED",
        resolvedAt: { lte: cutoff },
      },
      orderBy: [
        { resolvedAt: "asc" },
        { id: "asc" },
      ],
      take: input.batchSize,
      select: { id: true },
    });

  if (candidates.length === 0) {
    return {
      enabled: true,
      deletedResolvedAlertCount: 0,
      cutoff,
    };
  }

  const deleted =
    await database.notificationOperationalAlert.deleteMany({
      where: {
        id: {
          in: candidates.map(
            (candidate) => candidate.id,
          ),
        },
        status: "RESOLVED",
      },
    });

  await database.auditEvent.create({
    data: {
      userId: null,
      action:
        "NOTIFICATION_RETENTION_APPLIED",
      entityType:
        "NotificationOperationalAlert",
      entityId: null,
      metadata: {
        deletedResolvedAlertCount:
          deleted.count,
        cutoff: cutoff.toISOString(),
        retentionDays:
          input.alertRetentionDays,
        appliedAt: now.toISOString(),
      },
    },
  });

  return {
    enabled: true,
    deletedResolvedAlertCount:
      deleted.count,
    cutoff,
  };
}

function validateInput(input: {
  alertRetentionDays: number;
  batchSize: number;
}): void {
  if (
    !Number.isInteger(
      input.alertRetentionDays,
    ) ||
    input.alertRetentionDays < 1 ||
    input.alertRetentionDays > 3650
  ) {
    throw new Error(
      "Operational alert retention days must be between 1 and 3650.",
    );
  }

  if (
    !Number.isInteger(input.batchSize) ||
    input.batchSize < 1 ||
    input.batchSize > 1000
  ) {
    throw new Error(
      "Retention batch size must be between 1 and 1000.",
    );
  }
}
