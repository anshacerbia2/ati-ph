import {
  read,
  SSF,
  utils,
  type CellObject,
  type WorkBook,
  type WorkSheet,
} from "xlsx";

import {
  GOVERNED_HOLIDAY_SCHEMA_VERSION,
  HOLIDAY_IMPORT_SCHEMA_NAME,
  HOLIDAY_METADATA_SHEET,
  HOLIDAY_SOURCE_SHEET,
  HOLIDAY_TEMPLATE_TYPE,
  LEGACY_HOLIDAY_SCHEMA_VERSION,
  type ImportIssue,
  type NormalizedHolidayRow,
  type ParsedHolidayWorkbook,
  type ParsedImportRow,
} from "@/imports/contracts";
import { normalizeLookupKey } from "@/lib/lookup-key";

type CanonicalField =
  | "regionCode"
  | "holidayName"
  | "startDate"
  | "endDate"
  | "notes";

type ColumnBinding = {
  header: string;
  column: number;
};

type ColumnMapping = Partial<Record<CanonicalField, ColumnBinding>>;

const REQUIRED_FIELDS: readonly CanonicalField[] = [
  "regionCode",
  "holidayName",
  "startDate",
  "endDate",
];

const HEADER_ALIASES = new Map<string, CanonicalField>([
  ["region", "regionCode"],
  ["regioncode", "regionCode"],
  ["calendarregion", "regionCode"],
  ["phname", "holidayName"],
  ["holidayname", "holidayName"],
  ["publicholiday", "holidayName"],
  ["phstartdate", "startDate"],
  ["startdate", "startDate"],
  ["phenddate", "endDate"],
  ["enddate", "endDate"],
  ["remarks", "notes"],
  ["notes", "notes"],
]);

export class WorkbookContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkbookContractError";
  }
}

export async function parseHolidayWorkbook(
  bytes: Uint8Array,
  options: {
    regionAliases: ReadonlyMap<string, string>;
    rejectSampleRows?: boolean;
    maximumPeriodDays?: number;
  },
): Promise<ParsedHolidayWorkbook> {
  let workbook: ReturnType<typeof read>;

  try {
    workbook = read(bytes, {
      cellDates: true,
      cellNF: true,
      dense: false,
    });
  } catch {
    throw new WorkbookContractError("Workbook cannot be parsed as XLSX.");
  }

  const governedMetadata = readGovernedMetadata(workbook);
  const schemaVersion =
    governedMetadata?.schemaVersion ??
    LEGACY_HOLIDAY_SCHEMA_VERSION;

  const worksheet = workbook.Sheets[HOLIDAY_SOURCE_SHEET];
  if (!worksheet) {
    throw new WorkbookContractError(
      `Required sheet "${HOLIDAY_SOURCE_SHEET}" was not found.`,
    );
  }

  const issues: ImportIssue[] = [];

  if (!governedMetadata) {
    issues.push({
      severity: "INFO",
      code: "LEGACY_SCHEMA_ASSUMED",
      message:
        "Legacy Holiday_Master workbook format detected; the approved compatibility mapping was applied.",
    });
  }

  issues.push({
    severity: "INFO",
    code: "DERIVED_COLUMNS_IGNORED",
    message:
      "Legacy Day and Tag columns are retained as raw evidence but are not authoritative input.",
  });

  const columnMapping = mapHeaders(worksheet, issues);

  if (REQUIRED_FIELDS.some((field) => !columnMapping[field])) {
    return {
      schemaName: HOLIDAY_IMPORT_SCHEMA_NAME,
      schemaVersion,
      sourceSheet: HOLIDAY_SOURCE_SHEET,
      columnMapping: serializableMapping(columnMapping),
      rows: [],
      issues,
    };
  }

  const range = worksheet["!ref"]
    ? utils.decode_range(worksheet["!ref"])
    : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };

  const maximumPeriodDays = options.maximumPeriodDays ?? 31;
  const rows: ParsedImportRow[] = [];
  const rowIssues = new Map<number, ImportIssue[]>();

  for (let zeroBasedRow = 1; zeroBasedRow <= range.e.r; zeroBasedRow += 1) {
    const sourceRowNumber = zeroBasedRow + 1;

    if (!hasMappedValue(worksheet, zeroBasedRow, columnMapping)) {
      continue;
    }

    const currentIssues: ImportIssue[] = [];
    rowIssues.set(sourceRowNumber, currentIssues);

    const rawData = readRawRow(worksheet, zeroBasedRow, range.e.c);
    const normalizedData = normalizeHolidayRow(
      worksheet,
      zeroBasedRow,
      columnMapping,
      options.regionAliases,
      maximumPeriodDays,
      options.rejectSampleRows === true,
      currentIssues,
      sourceRowNumber,
    );

    rows.push({
      sourceSheet: HOLIDAY_SOURCE_SHEET,
      sourceRowNumber,
      rawData,
      normalizedData,
      status: currentIssues.some((issue) => issue.severity === "ERROR")
        ? "INVALID"
        : "VALID",
    });
  }

  detectDuplicatesAndOverlaps(rows, rowIssues);

  for (const row of rows) {
    const currentIssues = rowIssues.get(row.sourceRowNumber) ?? [];
    if (currentIssues.some((issue) => issue.severity === "ERROR")) {
      row.status = "INVALID";
    }
    issues.push(...currentIssues);
  }

  return {
    schemaName: HOLIDAY_IMPORT_SCHEMA_NAME,
    schemaVersion,
    sourceSheet: HOLIDAY_SOURCE_SHEET,
    columnMapping: serializableMapping(columnMapping),
    rows,
    issues,
  };
}

function readGovernedMetadata(
  workbook: WorkBook,
): { schemaVersion: string } | undefined {
  const metadataSheet = workbook.Sheets[HOLIDAY_METADATA_SHEET];
  if (!metadataSheet) {
    return undefined;
  }

  const rows = utils.sheet_to_json(metadataSheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as unknown[][];

  const metadata = new Map<string, string>();
  const governedKeys = new Set([
    "schema_name",
    "schema_version",
    "template_type",
    "data_sheet",
  ]);

  for (const row of rows) {
    if (!Array.isArray(row)) continue;

    const key = String(row[0] ?? "")
      .trim()
      .toLowerCase();

    if (!governedKeys.has(key)) continue;

    metadata.set(
      key,
      String(row[1] ?? "").trim(),
    );
  }

  const expected = new Map<string, string>([
    ["schema_name", HOLIDAY_IMPORT_SCHEMA_NAME],
    ["schema_version", GOVERNED_HOLIDAY_SCHEMA_VERSION],
    ["template_type", HOLIDAY_TEMPLATE_TYPE],
    ["data_sheet", HOLIDAY_SOURCE_SHEET],
  ]);

  for (const [key, expectedValue] of expected) {
    const actualValue = metadata.get(key);
    if (actualValue !== expectedValue) {
      throw new WorkbookContractError(
        `Governed metadata "${key}" must be "${expectedValue}".`,
      );
    }
  }

  return {
    schemaVersion: GOVERNED_HOLIDAY_SCHEMA_VERSION,
  };
}

function mapHeaders(worksheet: WorkSheet, issues: ImportIssue[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const range = worksheet["!ref"]
    ? utils.decode_range(worksheet["!ref"])
    : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };

  for (
    let zeroBasedColumn = range.s.c;
    zeroBasedColumn <= range.e.c;
    zeroBasedColumn += 1
  ) {
    const header = cellText(cellAt(worksheet, 0, zeroBasedColumn)).trim();
    if (!header) continue;

    const canonical = HEADER_ALIASES.get(normalizeHeader(header));
    if (!canonical) continue;

    if (mapping[canonical]) {
      issues.push({
        severity: "ERROR",
        code: "AMBIGUOUS_HEADER",
        fieldName: canonical,
        rejectedValue: header,
        message: `More than one source column maps to ${canonical}.`,
      });
      continue;
    }

    mapping[canonical] = { header, column: zeroBasedColumn };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!mapping[field]) {
      issues.push({
        severity: "ERROR",
        code: "MISSING_REQUIRED_HEADER",
        fieldName: field,
        message: `Required column ${field} is missing.`,
      });
    }
  }

  return mapping;
}

function normalizeHolidayRow(
  worksheet: WorkSheet,
  zeroBasedRow: number,
  mapping: ColumnMapping,
  regionAliases: ReadonlyMap<string, string>,
  maximumPeriodDays: number,
  rejectSampleRows: boolean,
  issues: ImportIssue[],
  sourceRowNumber: number,
): NormalizedHolidayRow {
  const regionValue = requiredText(
    worksheet,
    zeroBasedRow,
    mapping.regionCode,
    "regionCode",
    issues,
    sourceRowNumber,
  );
  const holidayName = requiredText(
    worksheet,
    zeroBasedRow,
    mapping.holidayName,
    "holidayName",
    issues,
    sourceRowNumber,
  );
  const startDate = readDate(
    worksheet,
    zeroBasedRow,
    mapping.startDate,
    "startDate",
    issues,
    sourceRowNumber,
  );
  const endDate = readDate(
    worksheet,
    zeroBasedRow,
    mapping.endDate,
    "endDate",
    issues,
    sourceRowNumber,
  );


  if (holidayName.length > 200) {
    issues.push({
      severity: "ERROR",
      code: "VALUE_TOO_LONG",
      fieldName: "holidayName",
      rejectedValue: holidayName,
      message: "holidayName cannot exceed 200 characters.",
      sourceRowNumber,
    });
  }

  const notes = optionalText(worksheet, zeroBasedRow, mapping.notes);

  if (notes && notes.length > 2_000) {
    issues.push({
      severity: "ERROR",
      code: "VALUE_TOO_LONG",
      fieldName: "notes",
      message: "notes cannot exceed 2000 characters.",
      sourceRowNumber,
    });
  }

  const sourceRegions = splitRegions(regionValue);
  const regionCodes: string[] = [];

  for (const region of sourceRegions) {
    const code = regionAliases.get(normalizeLookupKey(region));
    if (!code) {
      issues.push({
        severity: "ERROR",
        code: "UNKNOWN_REGION",
        fieldName: "regionCode",
        rejectedValue: region,
        message: `Region "${region}" is not an approved calendar-region alias.`,
        sourceRowNumber,
      });
    } else if (!regionCodes.includes(code)) {
      regionCodes.push(code);
    }
  }

  if (sourceRegions.length > 1) {
    issues.push({
      severity: "INFO",
      code: "MULTI_REGION_NORMALIZED",
      fieldName: "regionCode",
      rejectedValue: regionValue,
      message:
        `${sourceRegions.length} legacy region values were normalized into relational region codes.`,
      sourceRowNumber,
    });
  }

  if (startDate && endDate) {
    const durationDays = differenceInDays(startDate, endDate) + 1;

    if (durationDays < 1) {
      issues.push({
        severity: "ERROR",
        code: "END_DATE_BEFORE_START_DATE",
        fieldName: "endDate",
        rejectedValue: endDate,
        message: "End date must be on or after start date.",
        sourceRowNumber,
      });
    } else if (durationDays > maximumPeriodDays) {
      issues.push({
        severity: "ERROR",
        code: "DATE_PERIOD_TOO_LONG",
        fieldName: "endDate",
        rejectedValue: endDate,
        message: `Holiday period exceeds the ${maximumPeriodDays}-day safety limit.`,
        sourceRowNumber,
      });
    }

    if (startDate.slice(0, 4) !== endDate.slice(0, 4)) {
      issues.push({
        severity: "WARNING",
        code: "CROSS_YEAR_PERIOD",
        fieldName: "endDate",
        rejectedValue: endDate,
        message: "Holiday period crosses a calendar-year boundary.",
        sourceRowNumber,
      });
    }
  }

  if (looksLikeSample(`${regionValue} ${holidayName}`)) {
    issues.push({
      severity: rejectSampleRows ? "ERROR" : "WARNING",
      code: "SAMPLE_ROW_DETECTED",
      message: rejectSampleRows
        ? "Sample or test rows are not permitted in governed imports."
        : "Sample or test row detected.",
      sourceRowNumber,
    });
  }

  return {
    sourceRegions,
    regionCodes,
    holidayName,
    normalizedHolidayName: normalizeHolidayName(holidayName),
    startDate,
    endDate,
    calendarYear: startDate ? Number(startDate.slice(0, 4)) : undefined,
    notes,
  };
}

function detectDuplicatesAndOverlaps(
  rows: ParsedImportRow[],
  issuesByRow: Map<number, ImportIssue[]>,
): void {
  const identities = new Map<string, ParsedImportRow>();

  for (const row of rows) {
    const value = row.normalizedData;
    if (!value.startDate || !value.endDate || value.regionCodes.length === 0) {
      continue;
    }

    const key = [
      value.normalizedHolidayName,
      value.startDate,
      value.endDate,
      [...value.regionCodes].sort().join(","),
    ].join("|");

    const prior = identities.get(key);
    if (prior) {
      issuesByRow.get(row.sourceRowNumber)?.push({
        severity: "ERROR",
        code: "DUPLICATE_HOLIDAY_OCCURRENCE",
        message: `Duplicates source row ${prior.sourceRowNumber}.`,
        sourceRowNumber: row.sourceRowNumber,
      });
    } else {
      identities.set(key, row);
    }
  }

  for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
    const left = rows[leftIndex].normalizedData;
    if (!left.startDate || !left.endDate || !left.normalizedHolidayName) {
      continue;
    }

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < rows.length;
      rightIndex += 1
    ) {
      const rightRow = rows[rightIndex];
      const right = rightRow.normalizedData;

      if (
        left.normalizedHolidayName !== right.normalizedHolidayName ||
        !right.startDate ||
        !right.endDate ||
        !left.regionCodes.some((code) => right.regionCodes.includes(code))
      ) {
        continue;
      }

      if (left.startDate <= right.endDate && right.startDate <= left.endDate) {
        issuesByRow.get(rightRow.sourceRowNumber)?.push({
          severity: "WARNING",
          code: "OVERLAPPING_HOLIDAY_OCCURRENCE",
          message:
            `Overlaps another occurrence of the same holiday at source row ${rows[leftIndex].sourceRowNumber}.`,
          sourceRowNumber: rightRow.sourceRowNumber,
        });
      }
    }
  }
}

function readDate(
  worksheet: WorkSheet,
  zeroBasedRow: number,
  binding: ColumnBinding | undefined,
  fieldName: string,
  issues: ImportIssue[],
  sourceRowNumber: number,
): string | undefined {
  if (!binding) return undefined;

  const cell = cellAt(worksheet, zeroBasedRow, binding.column);
  if (cell?.f) {
    issues.push({
      severity: "ERROR",
      code: "FORMULA_NOT_ALLOWED",
      fieldName,
      rejectedValue: cellText(cell),
      message: "Formula cells cannot supply authoritative import dates.",
      sourceRowNumber,
    });
    return undefined;
  }

  const parsed = parseSheetDate(cell?.v);
  if (!parsed) {
    issues.push({
      severity: "ERROR",
      code: "INVALID_DATE",
      fieldName,
      rejectedValue: cellText(cell),
      message: `${fieldName} must be a typed Excel date or ISO YYYY-MM-DD value.`,
      sourceRowNumber,
    });
  }
  return parsed;
}

function requiredText(
  worksheet: WorkSheet,
  zeroBasedRow: number,
  binding: ColumnBinding | undefined,
  fieldName: string,
  issues: ImportIssue[],
  sourceRowNumber: number,
): string {
  if (!binding) return "";

  const cell = cellAt(worksheet, zeroBasedRow, binding.column);
  if (cell?.f) {
    issues.push({
      severity: "ERROR",
      code: "FORMULA_NOT_ALLOWED",
      fieldName,
      rejectedValue: cellText(cell),
      message: "Formula cells cannot supply authoritative import values.",
      sourceRowNumber,
    });
    return "";
  }

  const value = cellText(cell).trim();
  if (!value) {
    issues.push({
      severity: "ERROR",
      code: "REQUIRED_VALUE_MISSING",
      fieldName,
      message: `${fieldName} is required.`,
      sourceRowNumber,
    });
  }
  return value;
}

function optionalText(
  worksheet: WorkSheet,
  zeroBasedRow: number,
  binding: ColumnBinding | undefined,
): string | undefined {
  if (!binding) return undefined;
  const value = cellText(cellAt(worksheet, zeroBasedRow, binding.column)).trim();
  return value || undefined;
}

function parseSheetDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = SSF.parse_date_code(value);
    if (!parsed) return undefined;

    return [
      String(parsed.y).padStart(4, "0"),
      String(parsed.m).padStart(2, "0"),
      String(parsed.d).padStart(2, "0"),
    ].join("-");
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const candidate = value.trim();
    const date = new Date(`${candidate}T00:00:00.000Z`);

    return !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === candidate
      ? candidate
      : undefined;
  }

  return undefined;
}

function readRawRow(
  worksheet: WorkSheet,
  zeroBasedRow: number,
  maximumColumn: number,
): Record<string, unknown> {
  const raw: Record<string, unknown> = {};

  for (let zeroBasedColumn = 0; zeroBasedColumn <= maximumColumn; zeroBasedColumn += 1) {
    const header =
      cellText(cellAt(worksheet, 0, zeroBasedColumn)).trim() ||
      `column_${zeroBasedColumn + 1}`;
    const value = serializeCell(cellAt(worksheet, zeroBasedRow, zeroBasedColumn));

    if (value !== null && value !== "") {
      raw[header] = value;
    }
  }

  return raw;
}

function serializeCell(cell: CellObject | undefined): unknown {
  if (!cell) return null;
  if (cell.f) {
    return {
      formula: cell.f,
      result: serializeValue(cell.v),
    };
  }
  return serializeValue(cell.v);
}

function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return String(value);
}

function hasMappedValue(
  worksheet: WorkSheet,
  zeroBasedRow: number,
  mapping: ColumnMapping,
): boolean {
  return Object.values(mapping).some((binding) =>
    binding
      ? cellText(cellAt(worksheet, zeroBasedRow, binding.column)).trim() !== ""
      : false,
  );
}

function cellAt(
  worksheet: WorkSheet,
  zeroBasedRow: number,
  zeroBasedColumn: number,
): CellObject | undefined {
  return worksheet[
    utils.encode_cell({ r: zeroBasedRow, c: zeroBasedColumn })
  ] as CellObject | undefined;
}

function cellText(cell: CellObject | undefined): string {
  if (!cell) return "";
  if (cell.v instanceof Date) return cell.v.toISOString();
  if (cell.v === null || cell.v === undefined) return "";
  return String(cell.v);
}

function splitRegions(value: string): string[] {
  return value
    .split(/[,;\r\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeHolidayName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function looksLikeSample(value: string): boolean {
  return /(?:\bsample\b|xxx)/i.test(value);
}

function differenceInDays(startDate: string, endDate: string): number {
  return (
    (Date.parse(`${endDate}T00:00:00.000Z`) -
      Date.parse(`${startDate}T00:00:00.000Z`)) /
    86_400_000
  );
}

function serializableMapping(
  mapping: ColumnMapping,
): Record<string, { header: string; column: number }> {
  return Object.fromEntries(
    Object.entries(mapping).filter(
      (entry): entry is [string, ColumnBinding] => Boolean(entry[1]),
    ),
  );
}
