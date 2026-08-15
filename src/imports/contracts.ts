export const HOLIDAY_IMPORT_SCHEMA_NAME = "ati-public-holiday-import";
export const LEGACY_HOLIDAY_SCHEMA_VERSION = "legacy-1.0";
export const HOLIDAY_SOURCE_SHEET = "Holiday_Master";

export type ValidationSeverity = "ERROR" | "WARNING" | "INFO";

export type ImportIssue = {
  severity: ValidationSeverity;
  code: string;
  fieldName?: string;
  rejectedValue?: string;
  message: string;
  sourceRowNumber?: number;
};

export type NormalizedHolidayRow = {
  sourceRowId?: string;
  regionCodes: string[];
  sourceRegions: string[];
  holidayName: string;
  normalizedHolidayName: string;
  startDate?: string;
  endDate?: string;
  calendarYear?: number;
  sourceReference?: string;
  notes?: string;
};

export type ParsedImportRow = {
  sourceSheet: string;
  sourceRowNumber: number;
  sourceRowId?: string;
  rawData: Record<string, unknown>;
  normalizedData: NormalizedHolidayRow;
  status: "VALID" | "INVALID";
};

export type ParsedHolidayWorkbook = {
  schemaName: string;
  schemaVersion: string;
  sourceSheet: string;
  columnMapping: Record<string, { header: string; column: number }>;
  rows: ParsedImportRow[];
  issues: ImportIssue[];
};

