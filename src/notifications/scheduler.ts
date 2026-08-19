import { Prisma, PrismaClient } from "@prisma/client";

export type NotificationSchedulerResult = {
  count: number;
  jobIds: string[];
};

export function notificationJobIsDue(
  job: {
    status: "WAITING_APPROVAL" | "PLANNED" | "DUE" | "CANCELLED";
    scheduledAt: Date;
  },
  now: Date,
): boolean {
  return (
    job.status === "PLANNED" &&
    job.scheduledAt.getTime() <= now.getTime()
  );
}

export async function promoteDueNotificationJobs(
  database: PrismaClient,
  input: { now?: Date; batchSize: number },
): Promise<NotificationSchedulerResult> {
  const now = input.now ?? new Date();

  if (
    !Number.isInteger(input.batchSize) ||
    input.batchSize < 1 ||
    input.batchSize > 500
  ) {
    throw new Error(
      "Notification scheduler batch size must be between 1 and 500.",
    );
  }

  return database.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        WITH due_jobs AS (
          SELECT job."id"
          FROM "notification"."notification_jobs" AS job
          WHERE job."status" =
            'PLANNED'::"notification"."NotificationJobStatus"
            AND job."scheduledAt" <= ${now}
          ORDER BY job."scheduledAt" ASC, job."id" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${input.batchSize}
        )
        UPDATE "notification"."notification_jobs" AS job
        SET
          "status" =
            'DUE'::"notification"."NotificationJobStatus",
          "dueAt" = ${now},
          "updatedAt" = CURRENT_TIMESTAMP
        FROM due_jobs
        WHERE job."id" = due_jobs."id"
        RETURNING job."id"
      `,
    );

    if (rows.length > 0) {
      await tx.auditEvent.create({
        data: {
          userId: null,
          action: "NOTIFICATION_JOBS_MARKED_DUE",
          entityType: "NotificationScheduler",
          entityId: null,
          metadata: {
            count: rows.length,
            jobIds: rows.map((row) => row.id),
            dueAt: now.toISOString(),
          },
        },
      });
    }

    return {
      count: rows.length,
      jobIds: rows.map((row) => row.id),
    };
  });
}
