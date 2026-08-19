import { describe, expect, it } from "vitest";

import {
  buildNotificationSchedulePreview,
  calculateNotificationSchedule,
  scheduleCalendarRange,
} from "@/notifications/schedule";
import type { PolicyScheduleShape } from "@/notifications/policy-rules";

function policy(
  overrides: Partial<PolicyScheduleShape> = {},
): PolicyScheduleShape {
  return {
    leadTimeValue: 5,
    leadTimeMode: "CALENDAR_DAY",
    sendTimeLocal: "09:00",
    timezone: "Australia/Sydney",
    weekendAdjustment: "NONE",
    businessDayHolidayMode: "UNCONFIRMED",
    approvalMode: "REQUIRED",
    ...overrides,
  };
}

describe("deterministic notification schedule calculation", () => {
  it("subtracts calendar-day lead time without inventing business-day rules", () => {
    const result = calculateNotificationSchedule({
      targetHolidayDate: "2026-01-26",
      policy: policy(),
    });

    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;

    expect(result.plannedLocalDate).toBe("2026-01-21");
    expect(result.plannedLocalTime).toBe("09:00");
    expect(result.timezone).toBe("Australia/Sydney");
    expect(result.approvalRequired).toBe(true);
  });

  it("subtracts business days and skips a published holiday when configured", () => {
    const result = calculateNotificationSchedule({
      targetHolidayDate: "2026-01-12",
      policy: policy({
        leadTimeValue: 3,
        leadTimeMode: "BUSINESS_DAY",
        businessDayHolidayMode: "EXCLUDE_PUBLIC_HOLIDAYS",
      }),
      publicHolidayDates: new Set(["2026-01-09"]),
    });

    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.plannedLocalDate).toBe("2026-01-06");
  });

  it("can ignore published holidays while still excluding weekends from business days", () => {
    const result = calculateNotificationSchedule({
      targetHolidayDate: "2026-01-12",
      policy: policy({
        leadTimeValue: 3,
        leadTimeMode: "BUSINESS_DAY",
        businessDayHolidayMode: "IGNORE_PUBLIC_HOLIDAYS",
      }),
      publicHolidayDates: new Set(["2026-01-09"]),
    });

    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.plannedLocalDate).toBe("2026-01-07");
  });

  it("moves a weekend send to the previous business day and honors public-holiday exclusion", () => {
    const result = calculateNotificationSchedule({
      targetHolidayDate: "2026-01-12",
      policy: policy({
        leadTimeValue: 1,
        weekendAdjustment: "PREVIOUS_BUSINESS_DAY",
        businessDayHolidayMode: "EXCLUDE_PUBLIC_HOLIDAYS",
      }),
      publicHolidayDates: new Set(["2026-01-09"]),
    });

    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.plannedLocalDate).toBe("2026-01-08");
  });

  it("moves a weekend send to the next business day", () => {
    const result = calculateNotificationSchedule({
      targetHolidayDate: "2026-01-12",
      policy: policy({
        leadTimeValue: 1,
        weekendAdjustment: "NEXT_BUSINESS_DAY",
        businessDayHolidayMode: "IGNORE_PUBLIC_HOLIDAYS",
      }),
    });

    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.plannedLocalDate).toBe("2026-01-12");
  });

  it("keeps a weekend send date when adjustment NONE is explicitly confirmed", () => {
    const result = calculateNotificationSchedule({
      targetHolidayDate: "2026-01-12",
      policy: policy({ leadTimeValue: 1 }),
    });

    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.plannedLocalDate).toBe("2026-01-11");
  });

  it("fails closed when schedule policy dimensions are unresolved", () => {
    const preview = buildNotificationSchedulePreview({
      targetHolidayDates: ["2026-01-26"],
      policy: policy({
        leadTimeValue: null,
        leadTimeMode: null,
        sendTimeLocal: null,
        timezone: null,
        weekendAdjustment: "UNCONFIRMED",
        approvalMode: "UNCONFIRMED",
      }),
    });

    expect(preview.status).toBe("BLOCKED");
    expect(preview.reasons).toContain("LEAD_TIME_UNCONFIGURED");
    expect(preview.reasons).toContain("TIMEZONE_UNCONFIGURED");
    expect(preview.reasons).toContain("APPROVAL_MODE_UNCONFIRMED");
  });

  it("builds a bounded published-calendar query window around target dates", () => {
    expect(
      scheduleCalendarRange(["2026-01-26", "2026-12-25"]),
    ).toEqual({
      startDate: "2023-11-18",
      endDate: "2027-01-25",
    });
  });
});
