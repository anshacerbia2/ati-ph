export type NotificationDeliveryEligibility =
  | { ok: true }
  | {
      ok: false;
      reasons: (
        | "JOB_NOT_DUE"
        | "AUTOMATIC_SEND_NOT_ALLOWED"
      )[];
    };

export function notificationDeliveryClaimEligibility(
  job: {
    status:
      | "WAITING_APPROVAL"
      | "PLANNED"
      | "DUE"
      | "PROCESSING"
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
