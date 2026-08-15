import { createHash } from "node:crypto";

import type { NormalizedHolidayRow } from "@/imports/contracts";

export type ApprovalHashRow = {
  id: string;
  sourceSheet: string;
  sourceRowNumber: number;
  status: "VALID" | "INVALID" | "EXCLUDED";
  normalizedData: NormalizedHolidayRow;
  excludedReason: string | null;
};

export type ApprovalHashIssue = {
  severity: "ERROR" | "WARNING" | "INFO";
  errorCode: string;
  fieldName: string | null;
  rejectedValue: string | null;
  message: string;
  sourceSheet: string | null;
  sourceRowNumber: number | null;
  acknowledgedAt: Date | string | null;
};

export function computeImportApprovalContentHash(
  rows: readonly ApprovalHashRow[],
  issues: readonly ApprovalHashIssue[],
): string {
  const canonical = {
    rows: [...rows]
      .sort(compareRows)
      .map((row) => ({
        sourceSheet: row.sourceSheet,
        sourceRowNumber: row.sourceRowNumber,
        status: row.status,
        normalizedData: row.normalizedData,
        excludedReason: row.excludedReason,
      })),
    issues: [...issues]
      .sort(compareIssues)
      .map((issue) => ({
        severity: issue.severity,
        errorCode: issue.errorCode,
        fieldName: issue.fieldName,
        rejectedValue: issue.rejectedValue,
        message: issue.message,
        sourceSheet: issue.sourceSheet,
        sourceRowNumber: issue.sourceRowNumber,
        acknowledged: Boolean(issue.acknowledgedAt),
      })),
  };

  return createHash("sha256")
    .update(stableStringify(canonical))
    .digest("hex");
}

export function approvalEligibility(input: {
  status: string;
  validRows: number;
  invalidRows: number;
  issues: readonly {
    severity: "ERROR" | "WARNING" | "INFO";
    acknowledgedAt: Date | string | null;
  }[];
}):
  | { ok: true }
  | { ok: false; reason: string } {
  if (input.status !== "VALIDATED") {
    return {
      ok: false,
      reason: "Batch must be VALIDATED before approval submission.",
    };
  }

  if (input.validRows < 1 || input.invalidRows > 0) {
    return {
      ok: false,
      reason: "Batch must contain valid rows and no invalid rows.",
    };
  }

  if (input.issues.some((issue) => issue.severity === "ERROR")) {
    return {
      ok: false,
      reason: "ERROR validation issues must be resolved first.",
    };
  }

  if (
    input.issues.some(
      (issue) =>
        issue.severity === "WARNING" && !issue.acknowledgedAt,
    )
  ) {
    return {
      ok: false,
      reason: "All WARNING issues must be acknowledged first.",
    };
  }

  return { ok: true };
}

function stableStringify(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify(object[key])}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(null);
}

function compareRows(
  left: ApprovalHashRow,
  right: ApprovalHashRow,
): number {
  return (
    left.sourceSheet.localeCompare(right.sourceSheet) ||
    left.sourceRowNumber - right.sourceRowNumber ||
    left.id.localeCompare(right.id)
  );
}

function compareIssues(
  left: ApprovalHashIssue,
  right: ApprovalHashIssue,
): number {
  return (
    (left.sourceRowNumber ?? -1) -
      (right.sourceRowNumber ?? -1) ||
    left.severity.localeCompare(right.severity) ||
    left.errorCode.localeCompare(right.errorCode) ||
    (left.fieldName ?? "").localeCompare(right.fieldName ?? "") ||
    left.message.localeCompare(right.message)
  );
}
