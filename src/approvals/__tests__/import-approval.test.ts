import { describe, expect, it } from "vitest";

import {
  approvalEligibility,
  computeImportApprovalContentHash,
} from "@/approvals/import-approval";

const row = {
  id: "row-1",
  sourceSheet: "Holiday_Master",
  sourceRowNumber: 2,
  revisionId: "11111111-1111-4111-8111-111111111111",
  status: "VALID" as const,
  normalizedData: {
    sourceRegions: ["Australia"],
    regionCodes: ["AU"],
    holidayName: "Australia Day",
    normalizedHolidayName: "australia day",
    startDate: "2026-01-26",
    endDate: "2026-01-26",
    calendarYear: 2026,
  },
  excludedReason: null,
};

describe("import approval", () => {
  it("creates a deterministic content hash", () => {
    const first = computeImportApprovalContentHash([row], []);
    const second = computeImportApprovalContentHash([row], []);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes the hash when governed staging changes", () => {
    const first = computeImportApprovalContentHash([row], []);
    const second = computeImportApprovalContentHash(
      [
        {
          ...row,
          normalizedData: {
            ...row.normalizedData,
            holidayName: "Changed",
          },
        },
      ],
      [],
    );

    expect(second).not.toBe(first);
  });

  it("changes the hash when revision identity changes", () => {
    const first = computeImportApprovalContentHash([row], []);
    const second = computeImportApprovalContentHash(
      [
        {
          ...row,
          revisionId:
            "22222222-2222-4222-8222-222222222222",
        },
      ],
      [],
    );

    expect(second).not.toBe(first);
  });

  it("requires warnings to be acknowledged", () => {
    expect(
      approvalEligibility({
        status: "VALIDATED",
        validRows: 1,
        invalidRows: 0,
        issues: [
          {
            severity: "WARNING",
            acknowledgedAt: null,
          },
        ],
      }),
    ).toEqual({
      ok: false,
      reason: "All WARNING issues must be acknowledged first.",
    });
  });

  it("accepts a validated clean batch", () => {
    expect(
      approvalEligibility({
        status: "VALIDATED",
        validRows: 1,
        invalidRows: 0,
        issues: [
          {
            severity: "WARNING",
            acknowledgedAt: "2026-08-16T00:00:00.000Z",
          },
        ],
      }),
    ).toEqual({ ok: true });
  });
});
