import { describe, expect, it } from "vitest";

import {
  HOLIDAY_IMPORT_SCHEMA_NAME,
  HOLIDAY_SOURCE_SHEET,
  LEGACY_HOLIDAY_SCHEMA_VERSION,
} from "@/imports/contracts";
import { parseClientPreviewJson } from "@/imports/client-preview";
import { computePreviewSha256 } from "@/imports/preview-integrity";

const preview = {
  schemaName: HOLIDAY_IMPORT_SCHEMA_NAME,
  schemaVersion: LEGACY_HOLIDAY_SCHEMA_VERSION,
  sourceSheet: HOLIDAY_SOURCE_SHEET,
  columnMapping: {
    holidayName: {
      header: "PH Name",
      column: 2,
    },
  },
  rows: [
    {
      sourceSheet: HOLIDAY_SOURCE_SHEET,
      sourceRowNumber: 2,
      rawData: { Region: "Australia" },
      normalizedData: {
        sourceRegions: ["Australia"],
        regionCodes: ["AU"],
        holidayName: "Example Holiday",
        normalizedHolidayName: "example holiday",
        startDate: "2027-01-01",
        endDate: "2027-01-01",
        calendarYear: 2027,
      },
      status: "VALID" as const,
    },
  ],
  issues: [],
};

describe("client preview contract", () => {
  it("accepts the governed preview shape", () => {
    expect(parseClientPreviewJson(JSON.stringify(preview))).toEqual(preview);
  });

  it("rejects source lineage outside Holiday_Master", () => {
    expect(() =>
      parseClientPreviewJson(
        JSON.stringify({
          ...preview,
          rows: [{ ...preview.rows[0], sourceSheet: "Other" }],
        }),
      ),
    ).toThrow("Client preview rows contain invalid source lineage.");
  });

  it("produces stable preview integrity hashes", () => {
    const first = computePreviewSha256(preview);
    const second = computePreviewSha256(
      JSON.parse(JSON.stringify(preview)),
    );

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});
