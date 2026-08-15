import { describe, expect, it } from "vitest";

import type { NormalizedHolidayRow } from "@/imports/contracts";
import {
  parseStagingCorrection,
  validateStagingRows,
} from "@/imports/staging-correction";

const base: NormalizedHolidayRow = {
  sourceRegions: ["Australia"],
  regionCodes: ["AU"],
  holidayName: "Australia Day",
  normalizedHolidayName: "australia day",
  startDate: "2026-01-26",
  endDate: "2026-01-26",
  calendarYear: 2026,
};

describe("staging correction", () => {
  it("recomputes governed normalized fields", () => {
    const result = parseStagingCorrection(base, {
      holidayName: "  New Year's Day  ",
      regionCodes: ["au", "NZ", "AU"],
      startDate: "2027-01-01",
      endDate: "2027-01-02",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.holidayName).toBe("New Year's Day");
    expect(result.value.normalizedHolidayName).toBe(
      "new year s day",
    );
    expect(result.value.regionCodes).toEqual(["AU", "NZ"]);
    expect(result.value.calendarYear).toBe(2027);
    expect(result.value.sourceRegions).toEqual(["Australia"]);
  });

  it("rejects invalid correction envelopes", () => {
    expect(
      parseStagingCorrection(base, {
        holidayName: "",
        regionCodes: [],
        startDate: "2026-99-99",
        endDate: "2026-01-01",
      }).ok,
    ).toBe(false);
  });
});

describe("staging validation", () => {
  it("blocks inactive regions and invalid periods", () => {
    const result = validateStagingRows(
      [
        {
          id: "row-1",
          sourceRowNumber: 2,
          status: "INVALID",
          normalizedData: {
            ...base,
            regionCodes: ["XX"],
            startDate: "2026-02-02",
            endDate: "2026-02-01",
          },
        },
      ],
      new Set(["AU"]),
    );

    expect(
      result.issues.map((issue) => issue.code),
    ).toEqual(
      expect.arrayContaining([
        "UNKNOWN_REGION",
        "END_DATE_BEFORE_START_DATE",
      ]),
    );
    expect(result.invalidRows).toBe(1);
  });

  it("detects duplicate occurrences after correction", () => {
    const result = validateStagingRows(
      [
        {
          id: "row-1",
          sourceRowNumber: 2,
          status: "VALID",
          normalizedData: base,
        },
        {
          id: "row-2",
          sourceRowNumber: 3,
          status: "VALID",
          normalizedData: { ...base },
        },
      ],
      new Set(["AU"]),
    );

    expect(
      result.issues.some(
        (issue) =>
          issue.code === "DUPLICATE_HOLIDAY_OCCURRENCE",
      ),
    ).toBe(true);
    expect(result.invalidRows).toBe(1);
  });

  it("excludes a row from blocking validation", () => {
    const result = validateStagingRows(
      [
        {
          id: "row-1",
          sourceRowNumber: 2,
          status: "EXCLUDED",
          excludedReason: "Confirmed non-production source row.",
          normalizedData: {
            ...base,
            regionCodes: [],
            holidayName: "(SAMPLE)",
          },
        },
      ],
      new Set(["AU"]),
    );

    expect(result.issues).toHaveLength(0);
    expect(result.invalidRows).toBe(0);
    expect(result.statuses.get("row-1")).toBe("EXCLUDED");
  });
});
