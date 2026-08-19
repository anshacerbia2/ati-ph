import "server-only";

import { createHash } from "node:crypto";

import { db } from "@/lib/db";
import {
  buildOccurrenceNotificationPlan,
} from "@/notifications/plan-engine";
import {
  initialNotificationJobStatus,
} from "@/notifications/job-rules";
import {
  NotificationTimeError,
  zonedLocalDateTimeToUtc,
} from "@/notifications/notification-time";

export class NotificationJobError extends Error {
  constructor(
    public readonly code:
      | "PLAN_ALREADY_COMMITTED"
      | "PLAN_NOT_COMMITTABLE"
      | "PLAN_TIME_CONVERSION_FAILED",
    message: string,
    public readonly status: 409,
  ) {
    super(message);
    this.name = "NotificationJobError";
  }
}

export async function commitOccurrenceNotificationPlan(
  occurrenceId: string,
  actorId: string,
) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${occurrenceId}),
        hashtext('notification-plan-commit')
      )
    `;

    const existing =
      await tx.holidayOccurrence.findUnique({
        where: { id: occurrenceId },
        select: {
          notificationCommittedAt: true,
          supersededAt: true,
        },
      });

    if (existing?.notificationCommittedAt) {
      throw new NotificationJobError(
        "PLAN_ALREADY_COMMITTED",
        "This holiday occurrence already has a committed notification plan.",
        409,
      );
    }

    const plan = await buildOccurrenceNotificationPlan(
      tx,
      occurrenceId,
    );

    if (plan.commit.state === "COMMITTED") {
      throw new NotificationJobError(
        "PLAN_ALREADY_COMMITTED",
        "This holiday occurrence already has a committed notification plan.",
        409,
      );
    }

    if (plan.commit.state !== "READY") {
      throw new NotificationJobError(
        "PLAN_NOT_COMMITTABLE",
        `Notification plan is not committable: ${plan.commit.reasons.join(", ")}.`,
        409,
      );
    }

    const matched = plan.results.filter(
      (result) => result.status === "MATCHED",
    );

    const now = new Date();
    let plannedCount = 0;
    let waitingApprovalCount = 0;

    for (const result of matched) {
      const candidate = result.schedule?.candidates[0];
      const policy = result.policy;
      const resolution = result.scheduleResolution;

      if (
        !candidate ||
        candidate.status !== "READY" ||
        !policy ||
        !resolution ||
        !resolution.sourceVersionId
      ) {
        throw new NotificationJobError(
          "PLAN_NOT_COMMITTABLE",
          `Notification plan became incomplete for ${result.clientName} during commit.`,
          409,
        );
      }

      let scheduledAt: Date;

      try {
        scheduledAt = zonedLocalDateTimeToUtc({
          localDate: candidate.plannedLocalDate,
          localTime: candidate.plannedLocalTime,
          timezone: candidate.timezone,
        });
      } catch (error) {
        if (error instanceof NotificationTimeError) {
          throw new NotificationJobError(
            "PLAN_TIME_CONVERSION_FAILED",
            `${result.clientName}: ${error.message}`,
            409,
          );
        }
        throw error;
      }

      const status = initialNotificationJobStatus(
        candidate.approvalRequired,
      );

      if (status === "PLANNED") {
        plannedCount += 1;
      } else {
        waitingApprovalCount += 1;
      }

      const idempotencyKey = createHash("sha256")
        .update(
          [
            occurrenceId,
            result.subscriptionId,
            candidate.targetHolidayDate,
            policy.versionId,
            resolution.sourceVersionId,
          ].join("|"),
        )
        .digest("hex");

      await tx.notificationJob.create({
        data: {
          idempotencyKey,
          holidayOccurrenceId: occurrenceId,
          clientSubscriptionId: result.subscriptionId,
          notificationPolicyVersionId: policy.versionId,
          notificationSchedulePolicyVersionId:
            resolution.source === "GLOBAL"
              ? resolution.sourceVersionId
              : null,
          scheduleSource: resolution.source,
          scheduleSourceVersion:
            resolution.sourceVersion ?? policy.version,
          targetHolidayDate: databaseDate(
            candidate.targetHolidayDate,
          ),
          plannedLocalDate: databaseDate(
            candidate.plannedLocalDate,
          ),
          plannedLocalTime: candidate.plannedLocalTime,
          timezone: candidate.timezone,
          scheduledAt,
          approvalMode: candidate.approvalMode,
          status,
          recipientSnapshot: {
            to: result.to,
            cc: result.cc,
          },
          ruleSnapshot: {
            holidayName: plan.occurrence.holidayName,
            calendarRegion: result.calendarRegion,
            scheduleSource: resolution.source,
            scheduleSourceVersion:
              resolution.sourceVersion,
            targetHolidayDate:
              candidate.targetHolidayDate,
            plannedLocalDate:
              candidate.plannedLocalDate,
            plannedLocalTime:
              candidate.plannedLocalTime,
            timezone: candidate.timezone,
            leadTimeValue: candidate.leadTimeValue,
            leadTimeMode: candidate.leadTimeMode,
            weekendAdjustment:
              candidate.weekendAdjustment,
            businessDayHolidayMode:
              candidate.businessDayHolidayMode,
            approvalMode: candidate.approvalMode,
            appliedRules: candidate.appliedRules,
          },
          automaticSendAllowed:
            policy.automaticSendAllowed,
          retryCeiling: policy.retryCeiling,
          committedById: actorId,
        },
      });
    }

    await tx.holidayOccurrence.update({
      where: { id: occurrenceId },
      data: { notificationCommittedAt: now },
    });

    await tx.auditEvent.create({
      data: {
        userId: actorId,
        action: "NOTIFICATION_PLAN_COMMITTED",
        entityType: "HolidayOccurrence",
        entityId: occurrenceId,
        metadata: {
          jobCount: matched.length,
          plannedCount,
          waitingApprovalCount,
          deliveryEnabledJobCount: matched.filter(
            (result) =>
              result.policy?.automaticSendAllowed === true,
          ).length,
        },
      },
    });

    await tx.outboxEvent.create({
      data: {
        topic: "notification.plan.committed",
        aggregateType: "HolidayOccurrence",
        aggregateId: occurrenceId,
        payload: {
          occurrenceId,
          committedAt: now.toISOString(),
          jobCount: matched.length,
          plannedCount,
          waitingApprovalCount,
        },
      },
    });

    return {
      occurrenceId,
      committedAt: now,
      jobCount: matched.length,
      plannedCount,
      waitingApprovalCount,
      deliveryMode: "DISABLED" as const,
    };
  });
}

function databaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
