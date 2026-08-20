import type {
  PrismaClient,
} from "@prisma/client";

import {
  commitOccurrenceNotificationPlanWithDatabase,
  NotificationJobError,
} from "@/notifications/jobs";
import {
  upsertNotificationOperationalAlert,
  resolveNotificationOperationalAlerts,
} from "@/notifications/operational-alerts";
import {
  buildOccurrenceNotificationPlan,
} from "@/notifications/plan-engine";
import {
  planningOperationalAlertType,
} from "@/notifications/trusted-automation-rules";

const PLANNING_ALERT_TYPES = [
  "PLANNING_BLOCKED",
  "ZERO_RECIPIENT",
] as const;

export async function runScheduledNotificationPlanning(
  database: PrismaClient,
  input: {
    now?: Date;
    batchSize: number;
    horizonDays: number;
    commitEnabled: boolean;
  },
) {
  validateInput(input);
  const now = input.now ?? new Date();
  const today = utcDateFloor(now);
  const horizon = new Date(
    today.getTime() +
      input.horizonDays * 86_400_000,
  );

  const occurrences =
    await database.holidayOccurrence.findMany({
      where: {
        supersededAt: null,
        notificationCommittedAt: null,
        endDate: { gte: today },
        startDate: { lte: horizon },
      },
      orderBy: [
        { startDate: "asc" },
        { publishedAt: "asc" },
        { id: "asc" },
      ],
      take: input.batchSize,
      select: {
        id: true,
        publishedById: true,
        startDate: true,
        endDate: true,
        supersedesOccurrenceId: true,
        definition: {
          select: { canonicalName: true },
        },
      },
    });

  let readyCount = 0;
  let committedCount = 0;
  let blockedCount = 0;
  let waitingApprovalCount = 0;

  for (const occurrence of occurrences) {
    try {
      const plan =
        await buildOccurrenceNotificationPlan(
          database,
          occurrence.id,
        );
      const activeAlertKeys: string[] = [];

      for (const result of plan.results) {
        if (result.status === "EXCEPTION") {
          const type =
            planningOperationalAlertType(
              result.code,
            );
          const alertKey =
            `planning:${occurrence.id}:${result.subscriptionId}:${result.code}`;
          activeAlertKeys.push(alertKey);

          await upsertNotificationOperationalAlert(
            database,
            {
              alertKey,
              type,
              severity:
                type === "ZERO_RECIPIENT"
                  ? "CRITICAL"
                  : "WARNING",
              holidayOccurrenceId:
                occurrence.id,
              summary:
                `${type === "ZERO_RECIPIENT" ? "Zero recipient" : "Planning blocked"}: ${result.clientName} · ${occurrence.definition.canonicalName}`,
              details: {
                code: result.code,
                reason: result.reason,
                clientName:
                  result.clientName,
                serviceTeamName:
                  result.serviceTeamName,
                matchingDates:
                  result.matchingDates,
              },
              now,
            },
          );
          continue;
        }

        if (
          result.status === "MATCHED" &&
          result.schedule?.status !== "READY"
        ) {
          const alertKey =
            `planning:${occurrence.id}:${result.subscriptionId}:SCHEDULE_NOT_READY`;
          activeAlertKeys.push(alertKey);
          await upsertNotificationOperationalAlert(
            database,
            {
              alertKey,
              type: "PLANNING_BLOCKED",
              severity: "WARNING",
              holidayOccurrenceId:
                occurrence.id,
              summary:
                `Schedule blocked: ${result.clientName} · ${occurrence.definition.canonicalName}`,
              details: {
                code: "SCHEDULE_NOT_READY",
                clientName:
                  result.clientName,
                serviceTeamName:
                  result.serviceTeamName,
                issues:
                  result.scheduleResolution
                    ?.issues ?? [],
                reasons:
                  result.schedule?.reasons ??
                  [],
              },
              now,
            },
          );
        }
      }

      if (
        plan.commit.state === "BLOCKED" &&
        activeAlertKeys.length === 0
      ) {
        const alertKey =
          `planning:${occurrence.id}:PLAN_BLOCKED`;
        activeAlertKeys.push(alertKey);
        await upsertNotificationOperationalAlert(
          database,
          {
            alertKey,
            type: "PLANNING_BLOCKED",
            severity: "WARNING",
            holidayOccurrenceId:
              occurrence.id,
            summary:
              `Notification plan blocked: ${occurrence.definition.canonicalName}`,
            details: {
              reasons: plan.commit.reasons,
              matched: plan.summary.matched,
              exceptions:
                plan.summary.exceptions,
              scheduleReady:
                plan.summary.scheduleReady,
            },
            now,
          },
        );
      }

      await resolveNotificationOperationalAlerts(
        database,
        {
          holidayOccurrenceId:
            occurrence.id,
          types: [...PLANNING_ALERT_TYPES],
          excludeAlertKeys:
            activeAlertKeys,
          now,
        },
      );

      if (plan.commit.state !== "READY") {
        blockedCount += 1;
        continue;
      }

      readyCount += 1;

      if (!input.commitEnabled) {
        continue;
      }

      try {
        const committed =
          await commitOccurrenceNotificationPlanWithDatabase(
            database,
            occurrence.id,
            occurrence.publishedById,
            { source: "AUTOMATION" },
          );
        committedCount += 1;
        waitingApprovalCount +=
          committed.waitingApprovalCount;
      } catch (error) {
        if (
          error instanceof NotificationJobError &&
          error.code ===
            "PLAN_ALREADY_COMMITTED"
        ) {
          continue;
        }

        throw error;
      }
    } catch (error) {
      blockedCount += 1;
      const alertKey =
        `planning:${occurrence.id}:AUTOMATION_ERROR`;
      await upsertNotificationOperationalAlert(
        database,
        {
          alertKey,
          type: "PLANNING_BLOCKED",
          severity: "CRITICAL",
          holidayOccurrenceId:
            occurrence.id,
          summary:
            `Planning automation failed: ${occurrence.definition.canonicalName}`,
          details: {
            code: "AUTOMATION_ERROR",
            message:
              error instanceof Error
                ? error.message
                : String(error),
          },
          now,
        },
      );
    }
  }

  return {
    scannedCount: occurrences.length,
    readyCount,
    committedCount,
    blockedCount,
    waitingApprovalCount,
    commitEnabled: input.commitEnabled,
    horizon,
  };
}

function validateInput(input: {
  batchSize: number;
  horizonDays: number;
}): void {
  if (
    !Number.isInteger(input.batchSize) ||
    input.batchSize < 1 ||
    input.batchSize > 200
  ) {
    throw new Error(
      "Notification automation batch size must be between 1 and 200.",
    );
  }

  if (
    !Number.isInteger(input.horizonDays) ||
    input.horizonDays < 1 ||
    input.horizonDays > 730
  ) {
    throw new Error(
      "Notification automation horizon must be between 1 and 730 days.",
    );
  }
}

function utcDateFloor(value: Date): Date {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
    ),
  );
}
