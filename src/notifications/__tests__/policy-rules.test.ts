import { describe, expect, it } from "vitest";

import {
  isPolicyScheduleReady,
  isValidTimeZone,
  policyScheduleIssues,
} from "@/notifications/policy-rules";

describe("notification policy schedule rules", () => {
  it("reports every unresolved schedule dimension without guessing", () => {
    expect(
      policyScheduleIssues({
        leadTimeValue: null,
        leadTimeMode: null,
        sendTimeLocal: null,
        timezone: null,
        weekendAdjustment: "UNCONFIRMED",
        businessDayHolidayMode: "UNCONFIRMED",
        approvalMode: "UNCONFIRMED",
      }),
    ).toEqual([
      "LEAD_TIME_UNCONFIGURED",
      "SEND_TIME_UNCONFIGURED",
      "TIMEZONE_UNCONFIGURED",
      "WEEKEND_ADJUSTMENT_UNCONFIRMED",
      "APPROVAL_MODE_UNCONFIRMED",
    ]);
  });

  it("requires the public-holiday rule only for business-day scheduling", () => {
    expect(
      policyScheduleIssues({
        leadTimeValue: 7,
        leadTimeMode: "BUSINESS_DAY",
        sendTimeLocal: "09:00",
        timezone: "Australia/Sydney",
        weekendAdjustment: "NONE",
        businessDayHolidayMode: "UNCONFIRMED",
        approvalMode: "REQUIRED",
      }),
    ).toContain("BUSINESS_DAY_HOLIDAY_RULE_UNCONFIRMED");

    expect(
      isPolicyScheduleReady({
        leadTimeValue: 7,
        leadTimeMode: "CALENDAR_DAY",
        sendTimeLocal: "09:00",
        timezone: "Australia/Sydney",
        weekendAdjustment: "NONE",
        businessDayHolidayMode: "UNCONFIRMED",
        approvalMode: "REQUIRED",
      }),
    ).toBe(true);
  });

  it("requires the public-holiday rule when weekend adjustment moves to a business day", () => {
    expect(
      policyScheduleIssues({
        leadTimeValue: 1,
        leadTimeMode: "CALENDAR_DAY",
        sendTimeLocal: "09:00",
        timezone: "Australia/Sydney",
        weekendAdjustment: "PREVIOUS_BUSINESS_DAY",
        businessDayHolidayMode: "UNCONFIRMED",
        approvalMode: "REQUIRED",
      }),
    ).toContain("BUSINESS_DAY_HOLIDAY_RULE_UNCONFIRMED");
  });

  it("validates IANA timezones", () => {
    expect(isValidTimeZone("Australia/Sydney")).toBe(true);
    expect(isValidTimeZone("Not/A_Timezone")).toBe(false);
  });
});
