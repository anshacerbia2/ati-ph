import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import {
  assertSafeXlsxPackage,
  parseHolidayWorkbook as parseHolidayWorkbookRaw,
  WorkbookContractError,
} from "@/imports/holiday-workbook";

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
  });
}

describe("holiday workbook import", () => {
  it("maps legacy headers, normalizes regions, and ignores derived fields", async () => {
    const bytes = await workbookBytes([
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
    expect(result.issues.map((issue) => issue.code)).toContain("MULTI_REGION_NORMALIZED");
  });

  it("blocks an unknown region and an invalid date period", async () => {
    const bytes = await workbookBytes([
      [
        "Atlantis",
        "Founders Day",
        new Date("2027-03-02T00:00:00.000Z"),
        new Date("2027-03-01T00:00:00.000Z"),
        "",
        "Mon",
        "Weekdays",
      ],
    ]);

    const result = await parseHolidayWorkbook(bytes);

    expect(result.rows[0].status).toBe("INVALID");
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["UNKNOWN_REGION", "END_DATE_BEFORE_START_DATE"]),
    );
  });

  it("rejects formulas in authoritative fields", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Holiday_Master");
    sheet.addRow(headers);
    sheet.addRow([
      "Indonesia",
      "Formula Holiday",
      { formula: "=DATE(2027,1,1)", result: new Date("2027-01-01T00:00:00.000Z") },
      new Date("2027-01-01T00:00:00.000Z"),
      "",
      "Fri",
      "Weekdays",
    ]);

    const result = await parseHolidayWorkbook(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
    );

    expect(result.rows[0].status).toBe("INVALID");
    expect(result.issues.map((issue) => issue.code)).toContain("FORMULA_NOT_ALLOWED");
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
    const result = await parseHolidayWorkbook(await workbookBytes([row, row]));

    expect(result.rows[1].status).toBe("INVALID");
    expect(result.issues.map((issue) => issue.code)).toContain(
      "DUPLICATE_HOLIDAY_OCCURRENCE",
    );
  });

  it("rejects a package containing VBA before workbook parsing", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types />");
    zip.file("xl/vbaProject.bin", "macro");
    const bytes = await zip.generateAsync({ type: "uint8array" });

    await expect(assertSafeXlsxPackage(bytes)).rejects.toThrow(
      new WorkbookContractError("Macro-enabled workbooks are not permitted."),
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

async function workbookBytes(rows: unknown[][]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Holiday_Master");
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(row);
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
