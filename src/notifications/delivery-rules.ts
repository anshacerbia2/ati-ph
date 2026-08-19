export type NotificationDeliveryEligibility =
  | { ok: true }
  | {
      ok: false;
      reasons: (
        | "JOB_NOT_DUE"
        | "AUTOMATIC_SEND_NOT_ALLOWED"
      )[];
    };

export type NotificationDeliveryFailureClass =
  | "RETRYABLE"
  | "TERMINAL"
  | "OUTCOME_UNKNOWN";

export type NotificationDeliveryRetryDecision =
  | {
      action: "RETRY";
      retryNumber: number;
      retryAt: Date;
      delaySeconds: number;
      remainingRetries: number;
      retryCeiling: number;
    }
  | {
      action: "FAIL";
      reason:
        | "TERMINAL_FAILURE"
        | "DELIVERY_OUTCOME_UNKNOWN"
        | "RETRY_CEILING_EXHAUSTED";
      retriesUsed: number;
      retryCeiling: number;
    };

export const NOTIFICATION_RETRY_BASE_SECONDS = 60;
export const NOTIFICATION_RETRY_MAX_SECONDS = 3600;

export function notificationDeliveryClaimEligibility(
  job: {
    status:
      | "WAITING_APPROVAL"
      | "PLANNED"
      | "DUE"
      | "PROCESSING"
      | "RETRY_WAIT"
      | "SENT"
      | "FAILED"
      | "CANCELLED";
    automaticSendAllowed: boolean;
  },
): NotificationDeliveryEligibility {
  const reasons: (
    | "JOB_NOT_DUE"
    | "AUTOMATIC_SEND_NOT_ALLOWED"
  )[] = [];

  if (job.status !== "DUE") {
    reasons.push("JOB_NOT_DUE");
  }

  if (!job.automaticSendAllowed) {
    reasons.push("AUTOMATIC_SEND_NOT_ALLOWED");
  }

  return reasons.length
    ? { ok: false, reasons }
    : { ok: true };
}

/**
 * retryCeiling is the number of retries allowed after the initial attempt.
 *
 * Example:
 * retryCeiling = 3
 * attempt 1 fails -> retry 1
 * attempt 2 fails -> retry 2
 * attempt 3 fails -> retry 3
 * attempt 4 fails -> terminal FAILED
 */
export function notificationDeliveryRetryDecision(input: {
  failureClass: NotificationDeliveryFailureClass;
  attemptNumber: number;
  retryCeiling: number | null;
  now: Date;
}): NotificationDeliveryRetryDecision {
  if (
    !Number.isInteger(input.attemptNumber) ||
    input.attemptNumber < 1
  ) {
    throw new Error(
      "Notification delivery attempt number must be a positive integer.",
    );
  }

  const retryCeiling = Math.max(
    0,
    Math.floor(input.retryCeiling ?? 0),
  );
  const retriesUsed = input.attemptNumber - 1;

  if (input.failureClass === "TERMINAL") {
    return {
      action: "FAIL",
      reason: "TERMINAL_FAILURE",
      retriesUsed,
      retryCeiling,
    };
  }

  if (input.failureClass === "OUTCOME_UNKNOWN") {
    return {
      action: "FAIL",
      reason: "DELIVERY_OUTCOME_UNKNOWN",
      retriesUsed,
      retryCeiling,
    };
  }

  if (retriesUsed >= retryCeiling) {
    return {
      action: "FAIL",
      reason: "RETRY_CEILING_EXHAUSTED",
      retriesUsed,
      retryCeiling,
    };
  }

  const retryNumber = input.attemptNumber;
  const delaySeconds = Math.min(
    NOTIFICATION_RETRY_BASE_SECONDS *
      2 ** Math.max(0, retryNumber - 1),
    NOTIFICATION_RETRY_MAX_SECONDS,
  );

  return {
    action: "RETRY",
    retryNumber,
    retryAt: new Date(
      input.now.getTime() + delaySeconds * 1000,
    ),
    delaySeconds,
    remainingRetries:
      retryCeiling - retryNumber,
    retryCeiling,
  };
}
