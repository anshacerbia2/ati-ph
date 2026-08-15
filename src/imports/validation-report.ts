export type ValidationReportIssue = {
  severity: "ERROR" | "WARNING" | "INFO";
  errorCode: string;
  sourceSheet?: string;
  sourceRowNumber?: number;
  fieldName?: string;
  rejectedValue?: string;
  message: string;
};

export type ValidationReportBatch = {
  batchNumber: string;
  status: string;
  sourceName: string;
  schemaName: string;
  schemaVersion: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningCount: number;
  uploadedAt: Date;
};

export function buildValidationReportCsv(
  batch: ValidationReportBatch,
  issues: readonly ValidationReportIssue[],
): string {
  const metadata = [
    ["Report Type", "ATI PH Import Validation"],
    ["Batch Number", batch.batchNumber],
    ["Batch Status", batch.status],
    ["Source File", batch.sourceName],
    ["Schema", batch.schemaName],
    ["Schema Version", batch.schemaVersion],
    ["Uploaded At", batch.uploadedAt.toISOString()],
    ["Total Rows", String(batch.totalRows)],
    ["Valid Rows", String(batch.validRows)],
    ["Invalid Rows", String(batch.invalidRows)],
    ["Warnings", String(batch.warningCount)],
    ["Issue Count", String(issues.length)],
  ];

  const issueRows = [
    [
      "Severity",
      "Error Code",
      "Source Sheet",
      "Source Row",
      "Field",
      "Rejected Value",
      "Message",
    ],
    ...issues.map((issue) => [
      issue.severity,
      issue.errorCode,
      issue.sourceSheet ?? "",
      issue.sourceRowNumber?.toString() ?? "",
      issue.fieldName ?? "",
      issue.rejectedValue ?? "",
      issue.message,
    ]),
  ];

  return [
    "﻿" + metadata.map(toCsvRow).join("\r\n"),
    "",
    issueRows.map(toCsvRow).join("\r\n"),
    "",
  ].join("\r\n");
}

function toCsvRow(values: readonly string[]): string {
  return values.map(csvCell).join(",");
}

function csvCell(value: string): string {
  const normalized = value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");

  if (
    normalized.includes(",") ||
    normalized.includes('"') ||
    normalized.includes("\n")
  ) {
    return `"${normalized.replaceAll('"', '""')}"`;
  }

  return normalized;
}
