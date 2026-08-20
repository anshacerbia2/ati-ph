export type NotificationDeliveryReconciliationAction =
  | "MARK_SENT"
  | "RETRY"
  | "FAIL";

export type NotificationDeliveryReconciliationEligibility =
  | { ok: true }
  | { ok: false; reason: string };

export function notificationDeliveryReconciliationEligibility(input: {
  action: NotificationDeliveryReconciliationAction;
  attemptStatus: "CLAIMED" | "SENT" | "FAILED";
  failureClass: "RETRYABLE" | "TERMINAL" | "OUTCOME_UNKNOWN" | null;
  reconciliationAction:
    | NotificationDeliveryReconciliationAction
    | null;
  attemptNumber: number;
  jobAttemptCount: number;
  jobStatus:
    | "WAITING_APPROVAL"
    | "PLANNED"
    | "DUE"
    | "PROCESSING"
    | "RETRY_WAIT"
    | "SENT"
    | "FAILED"
    | "CANCELLED";
}): NotificationDeliveryReconciliationEligibility {
  if (input.attemptStatus !== "FAILED") {
    return {
      ok: false,
      reason: "Only a completed failed delivery attempt can be reconciled.",
    };
  }

  if (input.failureClass !== "OUTCOME_UNKNOWN") {
    return {
      ok: false,
      reason: "Manual reconciliation is reserved for OUTCOME_UNKNOWN delivery attempts.",
    };
  }

  if (input.reconciliationAction !== null) {
    return {
      ok: false,
      reason: "This delivery attempt has already been reconciled.",
    };
  }

  if (input.attemptNumber !== input.jobAttemptCount) {
    return {
      ok: false,
      reason: "Only the latest delivery attempt can reconcile the NotificationJob.",
    };
  }

  if (input.jobStatus !== "FAILED") {
    return {
      ok: false,
      reason: "The NotificationJob is no longer waiting for reconciliation.",
    };
  }

  if (
    input.action !== "MARK_SENT" &&
    input.action !== "RETRY" &&
    input.action !== "FAIL"
  ) {
    return {
      ok: false,
      reason: "Unsupported reconciliation action.",
    };
  }

  return { ok: true };
}
