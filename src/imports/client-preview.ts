import { z } from "zod";

import {
  GOVERNED_HOLIDAY_SCHEMA_VERSION,
  HOLIDAY_IMPORT_SCHEMA_NAME,
  HOLIDAY_SOURCE_SHEET,
  LEGACY_HOLIDAY_SCHEMA_VERSION,
  type ParsedHolidayWorkbook,
} from "@/imports/contracts";

export type ClientPreviewValidationCode =
  | "INVALID_WORKBOOK_PREVIEW"
  | "UNSUPPORTED_IMPORT_SCHEMA";

export class ClientPreviewValidationError extends Error {
  readonly code: ClientPreviewValidationCode;

  constructor(code: ClientPreviewValidationCode) {
    super(code);
    this.name = "ClientPreviewValidationError";
    this.code = code;
  }
}

const issueSchema = z.object({
  severity: z.enum(["ERROR", "WARNING", "INFO"]),
  code: z.string().min(1).max(80),
  fieldName: z.string().max(100).optional(),
  rejectedValue: z.string().max(10_000).optional(),
  message: z.string().min(1).max(10_000),
  sourceRowNumber: z.number().int().positive().optional(),
});

const normalizedRowSchema = z.object({
  regionCodes: z.array(z.string().min(1).max(16)).max(20),
  sourceRegions: z.array(z.string().max(500)).max(20),
  holidayName: z.string().max(5_000),
  normalizedHolidayName: z.string().max(5_000),
  startDate: z.string().max(32).optional(),
  endDate: z.string().max(32).optional(),
  calendarYear: z.number().int().min(1900).max(9999).optional(),
  notes: z.string().max(20_000).optional(),
});

const rowSchema = z.object({
  sourceSheet: z.string().max(150),
  sourceRowNumber: z.number().int().positive(),
  rawData: z.record(z.string().max(500), z.unknown()),
  normalizedData: normalizedRowSchema,
  status: z.enum(["VALID", "INVALID"]),
});

const previewSchema = z.object({
  schemaName: z.string().max(100),
  schemaVersion: z.string().max(30),
  sourceSheet: z.string().max(150),
  columnMapping: z.record(
    z.string().max(100),
    z.object({
      header: z.string().max(500),
      column: z.number().int().min(0).max(16_384),
    }),
  ),
  rows: z.array(rowSchema).max(20_000),
  issues: z.array(issueSchema).max(50_000),
});

export function parseClientPreviewJson(
  value: string,
): ParsedHolidayWorkbook {
  let decoded: unknown;

  try {
    decoded = JSON.parse(value);
  } catch {
    throw new ClientPreviewValidationError("INVALID_WORKBOOK_PREVIEW");
  }

  const parsed = previewSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new ClientPreviewValidationError("INVALID_WORKBOOK_PREVIEW");
  }

  if (
    parsed.data.schemaName !== HOLIDAY_IMPORT_SCHEMA_NAME ||
    !isSupportedClientPreviewSchemaVersion(parsed.data.schemaVersion) ||
    parsed.data.sourceSheet !== HOLIDAY_SOURCE_SHEET
  ) {
    throw new ClientPreviewValidationError("UNSUPPORTED_IMPORT_SCHEMA");
  }

  const rowNumbers = new Set<number>();

  for (const row of parsed.data.rows) {
    if (
      row.sourceSheet !== HOLIDAY_SOURCE_SHEET ||
      rowNumbers.has(row.sourceRowNumber)
    ) {
      throw new ClientPreviewValidationError("INVALID_WORKBOOK_PREVIEW");
    }

    rowNumbers.add(row.sourceRowNumber);
  }

  for (const issue of parsed.data.issues) {
    if (
      issue.sourceRowNumber &&
      !rowNumbers.has(issue.sourceRowNumber)
    ) {
      throw new ClientPreviewValidationError("INVALID_WORKBOOK_PREVIEW");
    }
  }

  return parsed.data;
}

export function isSupportedClientPreviewSchemaVersion(
  value: string,
): boolean {
  return (
    value === GOVERNED_HOLIDAY_SCHEMA_VERSION ||
    value === LEGACY_HOLIDAY_SCHEMA_VERSION
  );
}

export function previewHasBlockingErrors(
  preview: ParsedHolidayWorkbook,
): boolean {
  return (
    preview.rows.some((row) => row.status === "INVALID") ||
    preview.issues.some((issue) => issue.severity === "ERROR")
  );
}
