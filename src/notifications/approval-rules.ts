import { createHash } from "node:crypto";

export type NotificationApprovalHashJob = {
  id: string;
  idempotencyKey: string;
  notificationPolicyVersionId: string;
  notificationSchedulePolicyVersionId: string | null;
  scheduleSource: "GLOBAL" | "CLIENT_OVERRIDE";
  scheduleSourceVersion: number;
  targetHolidayDate: string;
  plannedLocalDate: string;
  plannedLocalTime: string;
  timezone: string;
  scheduledAt: string;
  approvalMode: "REQUIRED";
  recipientSnapshot: unknown;
  ruleSnapshot: unknown;
  automaticSendAllowed: boolean;
  retryCeiling: number | null;
};

export function notificationApprovalResourceKey(
  occurrenceId: string,
): string {
  return `NotificationPlan:${occurrenceId}`;
}

export function computeNotificationApprovalContentHash(
  jobs: readonly NotificationApprovalHashJob[],
): string {
  const canonical = [...jobs]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((job) => ({
      id: job.id,
      idempotencyKey: job.idempotencyKey,
      notificationPolicyVersionId:
        job.notificationPolicyVersionId,
      notificationSchedulePolicyVersionId:
        job.notificationSchedulePolicyVersionId,
      scheduleSource: job.scheduleSource,
      scheduleSourceVersion: job.scheduleSourceVersion,
      targetHolidayDate: job.targetHolidayDate,
      plannedLocalDate: job.plannedLocalDate,
      plannedLocalTime: job.plannedLocalTime,
      timezone: job.timezone,
      scheduledAt: job.scheduledAt,
      approvalMode: job.approvalMode,
      recipientSnapshot: job.recipientSnapshot,
      ruleSnapshot: job.ruleSnapshot,
      automaticSendAllowed: job.automaticSendAllowed,
      retryCeiling: job.retryCeiling,
    }));

  return createHash("sha256")
    .update(stableStringify(canonical))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify(object[key])}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(null);
}
