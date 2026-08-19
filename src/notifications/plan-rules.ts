export type NotificationPlanCommitState =
  | {
      state: "COMMITTED";
      committedAt: Date;
      reasons: [];
    }
  | {
      state: "READY";
      committedAt: null;
      reasons: [];
    }
  | {
      state: "BLOCKED";
      committedAt: null;
      reasons: string[];
    };

export function notificationPlanCommitReadiness(input: {
  committedAt: Date | null;
  matched: number;
  exceptions: number;
  matchedSchedules: Array<{
    status: "READY" | "BLOCKED" | null;
    candidateCount: number;
  }>;
}): NotificationPlanCommitState {
  if (input.committedAt) {
    return {
      state: "COMMITTED",
      committedAt: input.committedAt,
      reasons: [],
    };
  }

  const reasons: string[] = [];

  if (input.matched === 0) {
    reasons.push("NO_MATCHED_SUBSCRIPTIONS");
  }

  if (input.exceptions > 0) {
    reasons.push("MATCHING_EXCEPTIONS_PRESENT");
  }

  if (
    input.matchedSchedules.some(
      (schedule) => schedule.status !== "READY",
    )
  ) {
    reasons.push("SCHEDULE_NOT_READY");
  }

  if (
    input.matchedSchedules.some(
      (schedule) =>
        schedule.status === "READY" &&
        schedule.candidateCount !== 1,
    )
  ) {
    reasons.push(
      "MULTI_DATE_NOTIFICATION_SEMANTICS_UNCONFIRMED",
    );
  }

  return reasons.length
    ? {
        state: "BLOCKED",
        committedAt: null,
        reasons,
      }
    : {
        state: "READY",
        committedAt: null,
        reasons: [],
      };
}
