import { describe, expect, it } from "vitest";

import {
  GOVERNED_HOLIDAY_SCHEMA_VERSION,
  HOLIDAY_IMPORT_SCHEMA_NAME,
  HOLIDAY_SOURCE_SHEET,
  LEGACY_HOLIDAY_SCHEMA_VERSION,
} from "@/imports/contracts";
import {
  ClientPreviewValidationError,
  parseClientPreviewJson,
  previewHasBlockingErrors,
} from "@/imports/client-preview";
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
  it("accepts the approved legacy preview schema", () => {
    expect(parseClientPreviewJson(JSON.stringify(preview))).toEqual(preview);
  });

  it("accepts the governed 1.0 preview schema", () => {
    const governed = {
      ...preview,
      schemaVersion: GOVERNED_HOLIDAY_SCHEMA_VERSION,
    };

    expect(parseClientPreviewJson(JSON.stringify(governed))).toEqual(
      governed,
    );
  });

  it("rejects unsupported schema versions with a stable code", () => {
    try {
      parseClientPreviewJson(
        JSON.stringify({ ...preview, schemaVersion: "2.0" }),
      );
      throw new Error("Expected unsupported schema rejection.");
    } catch (error) {
      expect(error).toBeInstanceOf(ClientPreviewValidationError);
      expect((error as ClientPreviewValidationError).code).toBe(
        "UNSUPPORTED_IMPORT_SCHEMA",
      );
    }
  });

  it("rejects source lineage outside Holiday_Master", () => {
    expect(() =>
      parseClientPreviewJson(
        JSON.stringify({
          ...preview,
          rows: [{ ...preview.rows[0], sourceSheet: "Other" }],
        }),
      ),
    ).toThrowError(ClientPreviewValidationError);
  });

  it("detects blocking rows and issues for backend enforcement", () => {
    expect(previewHasBlockingErrors(preview)).toBe(false);
    expect(
      previewHasBlockingErrors({
        ...preview,
        rows: [{ ...preview.rows[0], status: "INVALID" as const }],
      }),
    ).toBe(true);
    expect(
      previewHasBlockingErrors({
        ...preview,
        issues: [
          {
            severity: "ERROR" as const,
            code: "BLOCKING",
            message: "Blocking issue",
          },
        ],
      }),
    ).toBe(true);
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
