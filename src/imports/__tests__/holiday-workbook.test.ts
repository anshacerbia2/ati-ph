import JSZip from "jszip";
import { utils, write } from "xlsx";
import { describe, expect, it } from "vitest";

import {
  parseHolidayWorkbook as parseHolidayWorkbookRaw,
  WorkbookContractError,
} from "@/imports/holiday-workbook";
import { assertSafeXlsxPackage } from "@/imports/xlsx-safety";

const TEST_REGION_ALIASES = new Map<string, string>([
  ["australia", "AU"],
  ["au", "AU"],
  ["indonesia", "ID"],
  ["id", "ID"],
  ["united kingdom", "GB"],
  ["uk", "GB"],
  ["gb", "GB"],
  ["south africa", "ZA"],
  ["za", "ZA"],
  ["north america", "NA"],
  ["na", "NA"],
  ["new zealand", "NZ"],
  ["nz", "NZ"],
  ["singapore", "SG"],
  ["sg", "SG"],
]);

async function parseHolidayWorkbook(bytes: Uint8Array) {
  return parseHolidayWorkbookRaw(bytes, {
    regionAliases: TEST_REGION_ALIASES,
    rejectSampleRows: true,
  });
}

describe("holiday workbook import", () => {
  it("treats legacy compatibility fallback as informational", async () => {
    const result = await parseHolidayWorkbook(
      workbookBytes([
        [
          "AU",
          "Legacy Holiday",
          new Date("2027-01-01T00:00:00.000Z"),
          new Date("2027-01-01T00:00:00.000Z"),
          "",
          "",
          "",
        ],
      ]),
    );

    const legacyIssue = result.issues.find(
      (issue) => issue.code === "LEGACY_SCHEMA_ASSUMED",
    );

    expect(legacyIssue?.severity).toBe("INFO");
    expect(result.schemaVersion).toBe("legacy-1.0");
  });

  it("recognizes governed workbook metadata", async () => {
    const result = await parseHolidayWorkbook(
      workbookBytes(
        [
          [
            "AU",
            "Governed Holiday",
            new Date("2027-01-01T00:00:00.000Z"),
            new Date("2027-01-01T00:00:00.000Z"),
            "",
            "",
            "",
          ],
        ],
        true,
      ),
    );

    expect(result.schemaVersion).toBe("1.0");
    expect(
      result.issues.some(
        (issue) => issue.code === "LEGACY_SCHEMA_ASSUMED",
      ),
    ).toBe(false);
  });

  it(
    "maps legacy headers, normalizes regions, and ignores derived fields",
    async () => {
      const bytes = workbookBytes([
        [
          "Australia, Indonesia",
          "New Year",
          new Date("2027-01-01T00:00:00.000Z"),
          new Date("2027-01-01T00:00:00.000Z"),
          "Imported",
          "Fri",
          "Weekdays",
        ],
      ]);

      const result = await parseHolidayWorkbook(bytes);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        sourceRowNumber: 2,
        status: "VALID",
        normalizedData: {
          regionCodes: ["AU", "ID"],
          holidayName: "New Year",
          startDate: "2027-01-01",
          endDate: "2027-01-01",
        },
      });
      expect(result.issues.map((issue) => issue.code)).toContain(
        "MULTI_REGION_NORMALIZED",
      );
    },
  );

  it("blocks an unknown region and an invalid date period", async () => {
    const result = await parseHolidayWorkbook(
      workbookBytes([
        [
          "Atlantis",
          "Founders Day",
          new Date("2027-03-02T00:00:00.000Z"),
          new Date("2027-03-01T00:00:00.000Z"),
          "",
          "Mon",
          "Weekdays",
        ],
      ]),
    );

    expect(result.rows[0].status).toBe("INVALID");
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "UNKNOWN_REGION",
        "END_DATE_BEFORE_START_DATE",
      ]),
    );
  });

  it("rejects formulas in authoritative fields", async () => {
    const sheet = utils.aoa_to_sheet([
      headers,
      [
        "Indonesia",
        "Formula Holiday",
        44927,
        new Date("2027-01-01T00:00:00.000Z"),
        "",
        "Fri",
        "Weekdays",
      ],
    ]);

    sheet.C2.f = "DATE(2027,1,1)";

    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, sheet, "Holiday_Master");

    const result = await parseHolidayWorkbook(
      new Uint8Array(
        write(workbook, {
          type: "array",
          bookType: "xlsx",
          cellDates: true,
        }),
      ),
    );

    expect(result.rows[0].status).toBe("INVALID");
    expect(result.issues.map((issue) => issue.code)).toContain(
      "FORMULA_NOT_ALLOWED",
    );
  });

  it("detects duplicate occurrences deterministically", async () => {
    const row = [
      "Indonesia",
      "New Year",
      new Date("2027-01-01T00:00:00.000Z"),
      new Date("2027-01-01T00:00:00.000Z"),
      "",
      "Fri",
      "Weekdays",
    ];

    const result = await parseHolidayWorkbook(workbookBytes([row, row]));

    expect(result.rows[1].status).toBe("INVALID");
    expect(result.issues.map((issue) => issue.code)).toContain(
      "DUPLICATE_HOLIDAY_OCCURRENCE",
    );
  });

  it("rejects a package containing VBA before authoritative verification", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types />");
    zip.file("xl/vbaProject.bin", "macro");

    const bytes = await zip.generateAsync({ type: "uint8array" });

    await expect(assertSafeXlsxPackage(bytes)).rejects.toThrow(
      new WorkbookContractError(
        "Macro-enabled workbooks are not permitted.",
      ),
    );
  });
});

const headers = [
  "Region",
  "PH Name",
  "PH Start Date",
  "PH End Date",
  "Remarks",
  "Day",
  "Tag",
];

function workbookBytes(
  rows: unknown[][],
  governed = false,
): Uint8Array {
  const sheet = utils.aoa_to_sheet([headers, ...rows]);
  const workbook = utils.book_new();

  utils.book_append_sheet(workbook, sheet, "Holiday_Master");

  if (governed) {
    const metadataSheet = utils.aoa_to_sheet([
      ["ATI-PH Governed Workbook Metadata", ""],
      ["SYSTEM CONTRACT — DO NOT EDIT", ""],
      ["Key", "Value"],
      ["schema_name", "ati-public-holiday-import"],
      ["schema_version", "1.0"],
      ["template_type", "PUBLIC_HOLIDAY_IMPORT"],
      ["data_sheet", "Holiday_Master"],
    ]);

    utils.book_append_sheet(
      workbook,
      metadataSheet,
      "_ATI_PH_META",
    );
  }

  return new Uint8Array(
    write(workbook, {
      type: "array",
      bookType: "xlsx",
      cellDates: true,
    }),
  );
}
