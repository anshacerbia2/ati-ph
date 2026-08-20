import type {
  NotificationSchedulePreview,
} from "@/notifications/schedule";

export type PlanningOperationalAlertType =
  | "PLANNING_BLOCKED"
  | "ZERO_RECIPIENT";

export function planningOperationalAlertType(
  code: string,
): PlanningOperationalAlertType {
  return code === "NO_TO_RECIPIENT"
    ? "ZERO_RECIPIENT"
    : "PLANNING_BLOCKED";
}

export function applyCorrectionApprovalOverride(
  schedule: NotificationSchedulePreview | null,
  isCorrection: boolean,
): NotificationSchedulePreview | null {
  if (!schedule || !isCorrection) {
    return schedule;
  }

  return {
    ...schedule,
    candidates: schedule.candidates.map(
      (candidate) => {
        if (candidate.status !== "READY") {
          return candidate;
        }

        const rules = candidate.appliedRules.filter(
          (rule) =>
            rule !== "APPROVAL_NOT_REQUIRED",
        );

        if (!rules.includes("APPROVAL_REQUIRED")) {
          rules.push("APPROVAL_REQUIRED");
        }
        if (
          !rules.includes(
            "CORRECTION_REQUIRES_APPROVAL",
          )
        ) {
          rules.push(
            "CORRECTION_REQUIRES_APPROVAL",
          );
        }

        return {
          ...candidate,
          approvalMode: "REQUIRED" as const,
          approvalRequired: true,
          appliedRules: rules,
        };
      },
    ),
  };
}

export function schedulerLagCutoff(
  now: Date,
  thresholdSeconds: number,
): Date {
  if (
    !Number.isInteger(thresholdSeconds) ||
    thresholdSeconds < 60 ||
    thresholdSeconds > 86_400
  ) {
    throw new Error(
      "Scheduler lag threshold must be between 60 and 86400 seconds.",
    );
  }

  return new Date(
    now.getTime() - thresholdSeconds * 1000,
  );
}
