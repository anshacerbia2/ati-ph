import { describe, expect, it } from "vitest";

import {
  NotificationTimeError,
  zonedLocalDateTimeToUtc,
} from "@/notifications/notification-time";

describe("notification local-time conversion", () => {
  it("converts Australia/Sydney local time to UTC deterministically", () => {
    expect(
      zonedLocalDateTimeToUtc({
        localDate: "2027-01-01",
        localTime: "09:00",
        timezone: "Australia/Sydney",
      }).toISOString(),
    ).toBe("2026-12-31T22:00:00.000Z");
  });

  it("converts Asia/Jakarta local time to UTC deterministically", () => {
    expect(
      zonedLocalDateTimeToUtc({
        localDate: "2027-01-04",
        localTime: "09:00",
        timezone: "Asia/Jakarta",
      }).toISOString(),
    ).toBe("2027-01-04T02:00:00.000Z");
  });

  it("fails closed on a nonexistent DST local time", () => {
    expect(() =>
      zonedLocalDateTimeToUtc({
        localDate: "2027-10-03",
        localTime: "02:30",
        timezone: "Australia/Sydney",
      }),
    ).toThrow(NotificationTimeError);
  });

  it("fails closed on an ambiguous DST local time", () => {
    expect(() =>
      zonedLocalDateTimeToUtc({
        localDate: "2027-04-04",
        localTime: "02:30",
        timezone: "Australia/Sydney",
      }),
    ).toThrow(NotificationTimeError);
  });
});
