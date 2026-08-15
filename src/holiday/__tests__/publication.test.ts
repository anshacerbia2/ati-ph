import { describe, expect, it } from "vitest";

import {
  expandHolidayDateRange,
  toDatabaseDate,
} from "@/holiday/publication";

describe("holiday publication date expansion", () => {
  it("expands every calendar date inclusively", () => {
    expect(
      expandHolidayDateRange("2026-12-25", "2026-12-28"),
    ).toEqual([
      {
        date: "2026-12-25",
        dayOfWeek: "FRIDAY",
        dayType: "WEEKDAY",
      },
      {
        date: "2026-12-26",
        dayOfWeek: "SATURDAY",
        dayType: "WEEKEND",
      },
      {
        date: "2026-12-27",
        dayOfWeek: "SUNDAY",
        dayType: "WEEKEND",
      },
      {
        date: "2026-12-28",
        dayOfWeek: "MONDAY",
        dayType: "WEEKDAY",
      },
    ]);
  });

  it("handles a one-day holiday", () => {
    expect(
      expandHolidayDateRange("2026-01-01", "2026-01-01"),
    ).toHaveLength(1);
  });

  it("rejects reversed periods", () => {
    expect(() =>
      expandHolidayDateRange("2026-01-02", "2026-01-01"),
    ).toThrow("Holiday end date cannot precede start date.");
  });

  it("converts ISO dates without timezone drift", () => {
    expect(
      toDatabaseDate("2026-08-16").toISOString(),
    ).toBe("2026-08-16T00:00:00.000Z");
  });
});
