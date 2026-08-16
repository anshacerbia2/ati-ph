import { describe, expect, it } from "vitest";

import {
  canonicalizeBusinessRows,
  computeBusinessContentSha256,
} from "@/imports/business-content";
import type { ParsedImportRow } from "@/imports/contracts";

function row(
  overrides: Partial<ParsedImportRow["normalizedData"]> = {},
  rowOverrides: Partial<ParsedImportRow> = {},
): ParsedImportRow {
  return {
    sourceSheet: "Holiday_Master",
    sourceRowNumber: 2,
    sourceRowId: "SRC-1",
    rawData: {
      Region: "Australia",
      "PH Name": "New Year",
    },
    normalizedData: {
      sourceRowId: "SRC-1",
      sourceRegions: ["Australia"],
      regionCodes: ["AU"],
      holidayName: "New Year",
      normalizedHolidayName: "new year",
      startDate: "2027-01-01",
      endDate: "2027-01-01",
      calendarYear: 2027,
      sourceReference: "REF-1",
      notes: "original note",
      ...overrides,
    },
    status: "VALID",
    ...rowOverrides,
  };
}

describe("business content hashing", () => {
  it("is deterministic across row and region ordering", () => {
    const first = [
      row({
        regionCodes: ["ID", "AU"],
      }),
      row(
        {
          regionCodes: ["SG"],
          holidayName: "Holiday Two",
          normalizedHolidayName: "holiday two",
          startDate: "2027-08-17",
          endDate: "2027-08-17",
        },
        {
          sourceRowNumber: 3,
          sourceRowId: "SRC-2",
        },
      ),
    ];

    const second = [
      {
        ...first[1],
        normalizedData: {
          ...first[1].normalizedData,
        },
      },
      {
        ...first[0],
        normalizedData: {
          ...first[0].normalizedData,
          regionCodes: ["AU", "ID"],
        },
      },
    ];

    expect(computeBusinessContentSha256(first)).toBe(
      computeBusinessContentSha256(second),
    );
  });

  it("ignores non-authoritative evidence metadata", () => {
    const first = row();

    const second = row(
      {
        sourceRowId: "DIFFERENT",
        sourceReference: "OTHER-REF",
        notes: "different notes",
      },
      {
        sourceRowNumber: 99,
        sourceRowId: "DIFFERENT",
        rawData: {
          Region: "AU",
          "PH Name": "NEW YEAR",
          Extra: "different workbook evidence",
        },
      },
    );

    expect(computeBusinessContentSha256([first])).toBe(
      computeBusinessContentSha256([second]),
    );
  });

  it("changes when authoritative holiday content changes", () => {
    expect(computeBusinessContentSha256([row()])).not.toBe(
      computeBusinessContentSha256([
        row({
          endDate: "2027-01-02",
        }),
      ]),
    );
  });

  it("returns null when content is not publishable", () => {
    expect(
      computeBusinessContentSha256([
        row({}, { status: "INVALID" }),
      ]),
    ).toBeNull();

    expect(canonicalizeBusinessRows([])).toBeNull();
  });
});
