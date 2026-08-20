import {
  describe,
  expect,
  it,
} from "vitest";

import {
  applyCorrectionApprovalOverride,
  planningOperationalAlertType,
  schedulerLagCutoff,
} from "@/notifications/trusted-automation-rules";

describe("trusted automation rules", () => {
  it("classifies missing TO recipients as zero-recipient alerts", () => {
    expect(
      planningOperationalAlertType(
        "NO_TO_RECIPIENT",
      ),
    ).toBe("ZERO_RECIPIENT");
    expect(
      planningOperationalAlertType(
        "NO_ACTIVE_POLICY",
      ),
    ).toBe("PLANNING_BLOCKED");
  });

  it("forces correction schedules through approval", () => {
    const result =
      applyCorrectionApprovalOverride(
        {
          status: "READY",
          reasons: [],
          candidates: [
            {
              status: "READY",
              targetHolidayDate:
                "2027-01-01",
              plannedLocalDate:
                "2026-12-20",
              plannedLocalTime: "09:00",
              timezone: "Asia/Manila",
              leadTimeValue: 12,
              leadTimeMode:
                "CALENDAR_DAY",
              weekendAdjustment: "NONE",
              businessDayHolidayMode:
                "IGNORE_PUBLIC_HOLIDAYS",
              approvalMode:
                "NOT_REQUIRED",
              approvalRequired: false,
              appliedRules: [
                "APPROVAL_NOT_REQUIRED",
              ],
            },
          ],
        },
        true,
      );

    expect(
      result?.candidates[0],
    ).toMatchObject({
      approvalMode: "REQUIRED",
      approvalRequired: true,
    });
    expect(
      result?.candidates[0].status ===
        "READY"
        ? result.candidates[0]
            .appliedRules
        : [],
    ).toContain(
      "CORRECTION_REQUIRES_APPROVAL",
    );
  });

  it("does not change ordinary schedules", () => {
    const schedule = {
      status: "BLOCKED" as const,
      reasons: ["NOPE"],
      candidates: [
        {
          status: "BLOCKED" as const,
          targetHolidayDate:
            "2027-01-01",
          reasons: ["NOPE"],
        },
      ],
    };

    expect(
      applyCorrectionApprovalOverride(
        schedule,
        false,
      ),
    ).toBe(schedule);
  });

  it("computes deterministic scheduler lag cutoff", () => {
    expect(
      schedulerLagCutoff(
        new Date(
          "2026-08-20T10:00:00.000Z",
        ),
        300,
      ).toISOString(),
    ).toBe(
      "2026-08-20T09:55:00.000Z",
    );
  });
});
