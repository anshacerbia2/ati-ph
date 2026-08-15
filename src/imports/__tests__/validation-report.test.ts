import { describe, expect, it } from "vitest";

import { buildValidationReportCsv } from "@/imports/validation-report";

const batch = {
  batchNumber: "PH-20260816-ABC123",
  status: "INVALID",
  sourceName: "holiday-source.xlsx",
  schemaName: "ati-public-holiday-import",
  schemaVersion: "legacy-1.0",
  totalRows: 25,
  validRows: 22,
  invalidRows: 3,
  warningCount: 1,
  uploadedAt: new Date("2026-08-16T00:00:00.000Z"),
};

describe("validation report CSV", () => {
  it("includes governed batch metadata and the issue table", () => {
    const csv = buildValidationReportCsv(batch, [
      {
        severity: "ERROR",
        errorCode: "UNKNOWN_REGION",
        sourceSheet: "Holiday_Master",
        sourceRowNumber: 12,
        fieldName: "regionCode",
        rejectedValue: "xxx",
        message: "Unknown region.",
      },
    ]);

    expect(csv).toContain("Batch Number,PH-20260816-ABC123");
    expect(csv).toContain("Issue Count,1");
    expect(csv).toContain(
      "ERROR,UNKNOWN_REGION,Holiday_Master,12,regionCode,xxx,Unknown region.",
    );
  });

  it("escapes commas, quotes, and line breaks", () => {
    const csv = buildValidationReportCsv(batch, [
      {
        severity: "WARNING",
        errorCode: "TEST",
        message: 'Value "A,B"\nneeds review',
      },
    ]);

    expect(csv).toContain(
      '"Value ""A,B""\nneeds review"',
    );
  });

  it("still emits a complete report when there are no issues", () => {
    const csv = buildValidationReportCsv(
      { ...batch, status: "VALIDATED", invalidRows: 0 },
      [],
    );

    expect(csv).toContain("Issue Count,0");
    expect(csv).toContain(
      "Severity,Error Code,Source Sheet,Source Row,Field,Rejected Value,Message",
    );
  });
});
