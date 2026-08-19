import { describe, expect, it } from "vitest";

import {
  computeNotificationApprovalContentHash,
  notificationApprovalResourceKey,
  type NotificationApprovalHashJob,
} from "@/notifications/approval-rules";

const base: NotificationApprovalHashJob = {
  id: "job-a",
  idempotencyKey: "a".repeat(64),
  notificationPolicyVersionId: "policy-v1",
  notificationSchedulePolicyVersionId: "schedule-v2",
  scheduleSource: "GLOBAL",
  scheduleSourceVersion: 2,
  targetHolidayDate: "2027-01-04",
  plannedLocalDate: "2026-12-30",
  plannedLocalTime: "09:00",
  timezone: "Australia/Sydney",
  scheduledAt: "2026-12-29T22:00:00.000Z",
  approvalMode: "REQUIRED",
  recipientSnapshot: {
    to: ["ops@example.test"],
    cc: [],
  },
  ruleSnapshot: { leadTimeValue: 5 },
  automaticSendAllowed: false,
  retryCeiling: null,
};

describe("notification approval snapshot", () => {
  it("uses an occurrence-scoped active approval key", () => {
    expect(
      notificationApprovalResourceKey("occurrence-1"),
    ).toBe("NotificationPlan:occurrence-1");
  });

  it("is deterministic regardless of input job ordering", () => {
    const second = {
      ...base,
      id: "job-b",
      idempotencyKey: "b".repeat(64),
    };

    expect(
      computeNotificationApprovalContentHash([
        base,
        second,
      ]),
    ).toBe(
      computeNotificationApprovalContentHash([
        second,
        base,
      ]),
    );
  });

  it("changes when frozen delivery content changes", () => {
    expect(
      computeNotificationApprovalContentHash([base]),
    ).not.toBe(
      computeNotificationApprovalContentHash([
        {
          ...base,
          plannedLocalTime: "10:00",
        },
      ]),
    );
  });
});
