import {
  describe,
  expect,
  it,
} from "vitest";

import {
  notificationDeliveryReconciliationEligibility,
  type NotificationDeliveryReconciliationAction,
} from "@/notifications/delivery-reconciliation-rules";

const base = {
  action: "MARK_SENT" as NotificationDeliveryReconciliationAction,
  attemptStatus: "FAILED" as const,
  failureClass: "OUTCOME_UNKNOWN" as const,
  reconciliationAction: null,
  attemptNumber: 2,
  jobAttemptCount: 2,
  jobStatus: "FAILED" as const,
};

describe("delivery reconciliation rules", () => {
  it.each([
    "MARK_SENT",
    "RETRY",
    "FAIL",
  ] as const)("allows explicit %s for the latest unresolved unknown outcome", (action) => {
    expect(
      notificationDeliveryReconciliationEligibility({
        ...base,
        action,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects non-unknown failures", () => {
    expect(
      notificationDeliveryReconciliationEligibility({
        ...base,
        failureClass: "TERMINAL",
      }),
    ).toMatchObject({ ok: false });
  });

  it("rejects an already reconciled attempt", () => {
    expect(
      notificationDeliveryReconciliationEligibility({
        ...base,
        reconciliationAction: "FAIL",
      }),
    ).toMatchObject({ ok: false });
  });

  it("rejects stale attempts", () => {
    expect(
      notificationDeliveryReconciliationEligibility({
        ...base,
        attemptNumber: 1,
      }),
    ).toMatchObject({ ok: false });
  });

  it("rejects reconciliation after the job moved away from FAILED", () => {
    expect(
      notificationDeliveryReconciliationEligibility({
        ...base,
        jobStatus: "SENT",
      }),
    ).toMatchObject({ ok: false });
  });
});
