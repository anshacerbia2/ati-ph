import ExcelJS from "exceljs";
import JSZip from "jszip";

import {
  HOLIDAY_IMPORT_SCHEMA_NAME,
  HOLIDAY_SOURCE_SHEET,
  LEGACY_HOLIDAY_SCHEMA_VERSION,
  type ImportIssue,
  type NormalizedHolidayRow,
  type ParsedHolidayWorkbook,
  type ParsedImportRow,
} from "@/imports/contracts";

type CanonicalField =
  | "sourceRowId"
  | "regionCode"
  | "holidayName"
  | "startDate"
  | "endDate"
  | "sourceReference"
  | "notes";

type ColumnBinding = { header: string; column: number };
type ColumnMapping = Partial<Record<CanonicalField, ColumnBinding>>;

const REQUIRED_FIELDS: readonly CanonicalField[] = [
  "regionCode",
  "holidayName",
  "startDate",
  "endDate",
];

const HEADER_ALIASES = new Map<string, CanonicalField>([
  ["sourcerowid", "sourceRowId"],
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
  ["sourcereference", "sourceReference"],
  ["remarks", "notes"],
  ["notes", "notes"],
]);

export const DEFAULT_REGION_ALIASES = new Map<string, string>([
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

export class WorkbookContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkbookContractError";
  }
}

export async function assertSafeXlsxPackage(bytes: Uint8Array): Promise<void> {
  if (
    bytes.length < 4 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 0x03 ||
    bytes[3] !== 0x04
  ) {
    throw new WorkbookContractError("File is not a readable XLSX ZIP package.");
  }

  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(bytes, { checkCRC32: true });
  } catch {
    throw new WorkbookContractError("Workbook is corrupt or encrypted.");
  }

  const entryNames = Object.keys(archive.files).map((name) => name.toLowerCase());
  if (entryNames.some((name) => name.endsWith("vbaproject.bin"))) {
    throw new WorkbookContractError("Macro-enabled workbooks are not permitted.");
  }

  const contentTypes = archive.file("[Content_Types].xml");
  const contentTypeText = contentTypes
    ? (await contentTypes.async("text")).toLowerCase()
    : "";
  if (contentTypeText.includes("macroenabled")) {
    throw new WorkbookContractError("Macro-enabled workbooks are not permitted.");
  }
}

export async function parseHolidayWorkbook(
  bytes: Uint8Array,
  options: {
    regionAliases?: ReadonlyMap<string, string>;
    rejectSampleRows?: boolean;
    maximumPeriodDays?: number;
  } = {},
): Promise<ParsedHolidayWorkbook> {
  await assertSafeXlsxPackage(bytes);

  const workbook = new ExcelJS.Workbook();
  try {
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    await workbook.xlsx.load(arrayBuffer);
  } catch {
    throw new WorkbookContractError("Workbook cannot be parsed as XLSX.");
  }

  const worksheet = workbook.getWorksheet(HOLIDAY_SOURCE_SHEET);
  if (!worksheet) {
    throw new WorkbookContractError(
      `Required sheet \"${HOLIDAY_SOURCE_SHEET}\" was not found.`,
    );
  }

  const issues: ImportIssue[] = [
    {
      severity: "WARNING",
      code: "LEGACY_SCHEMA_ASSUMED",
      message:
        "No governed metadata sheet was found; the approved legacy Holiday_Master mapping was applied.",
    },
    {
      severity: "INFO",
      code: "DERIVED_COLUMNS_IGNORED",
      message:
        "Legacy Day and Tag columns are retained as raw evidence but are not authoritative input.",
    },
  ];
  const columnMapping = mapHeaders(worksheet, issues);

  if (REQUIRED_FIELDS.some((field) => !columnMapping[field])) {
    return {
      schemaName: HOLIDAY_IMPORT_SCHEMA_NAME,
      schemaVersion: LEGACY_HOLIDAY_SCHEMA_VERSION,
      sourceSheet: HOLIDAY_SOURCE_SHEET,
      columnMapping: serializableMapping(columnMapping),
      rows: [],
      issues,
    };
  }

  const aliases = options.regionAliases ?? DEFAULT_REGION_ALIASES;
  const maximumPeriodDays = options.maximumPeriodDays ?? 31;
  const rows: ParsedImportRow[] = [];
  const rowIssues = new Map<number, ImportIssue[]>();

  for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    if (!hasMappedValue(row, columnMapping)) {
      continue;
    }

    const currentIssues: ImportIssue[] = [];
    rowIssues.set(rowNumber, currentIssues);
    const rawData = readRawRow(row, worksheet.getRow(1));
    const normalizedData = normalizeHolidayRow(
      row,
      columnMapping,
      aliases,
      workbook.properties.date1904 === true,
      maximumPeriodDays,
      options.rejectSampleRows === true,
      currentIssues,
      rowNumber,
    );

    rows.push({
      sourceSheet: HOLIDAY_SOURCE_SHEET,
      sourceRowNumber: rowNumber,
      sourceRowId: normalizedData.sourceRowId,
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
    schemaVersion: LEGACY_HOLIDAY_SCHEMA_VERSION,
    sourceSheet: HOLIDAY_SOURCE_SHEET,
    columnMapping: serializableMapping(columnMapping),
    rows,
    issues,
  };
}

function mapHeaders(
  worksheet: ExcelJS.Worksheet,
  issues: ImportIssue[],
): ColumnMapping {
  const mapping: ColumnMapping = {};
  const headerRow = worksheet.getRow(1);

  for (let column = 1; column <= headerRow.cellCount; column += 1) {
    const header = cellText(headerRow.getCell(column)).trim();
    if (!header) {
      continue;
    }
    const canonical = HEADER_ALIASES.get(normalizeHeader(header));
    if (!canonical) {
      continue;
    }
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
    mapping[canonical] = { header, column };
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
  row: ExcelJS.Row,
  mapping: ColumnMapping,
  regionAliases: ReadonlyMap<string, string>,
  date1904: boolean,
  maximumPeriodDays: number,
  rejectSampleRows: boolean,
  issues: ImportIssue[],
  sourceRowNumber: number,
): NormalizedHolidayRow {
  const sourceRowId = optionalText(row, mapping.sourceRowId);
  const regionValue = requiredText(
    row,
    mapping.regionCode,
    "regionCode",
    issues,
    sourceRowNumber,
  );
  const holidayName = requiredText(
    row,
    mapping.holidayName,
    "holidayName",
    issues,
    sourceRowNumber,
  );
  const startDate = readDate(
    row,
    mapping.startDate,
    "startDate",
    date1904,
    issues,
    sourceRowNumber,
  );
  const endDate = readDate(
    row,
    mapping.endDate,
    "endDate",
    date1904,
    issues,
    sourceRowNumber,
  );

  const sourceRegions = splitRegions(regionValue);
  const regionCodes: string[] = [];
  for (const region of sourceRegions) {
    const code = regionAliases.get(normalizeRegion(region));
    if (!code) {
      issues.push({
        severity: "ERROR",
        code: "UNKNOWN_REGION",
        fieldName: "regionCode",
        rejectedValue: region,
        message: `Region \"${region}\" is not an approved calendar-region alias.`,
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
      message: `${sourceRegions.length} legacy region values were normalized into relational region codes.`,
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
        ? "Sample or test rows are not permitted in production imports."
        : "Sample or test row detected; production will reject this row.",
      sourceRowNumber,
    });
  }

  return {
    sourceRowId,
    sourceRegions,
    regionCodes,
    holidayName,
    normalizedHolidayName: normalizeHolidayName(holidayName),
    startDate,
    endDate,
    calendarYear: startDate ? Number(startDate.slice(0, 4)) : undefined,
    sourceReference: optionalText(row, mapping.sourceReference),
    notes: optionalText(row, mapping.notes),
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
    for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
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
          message: `Overlaps another occurrence of the same holiday at source row ${rows[leftIndex].sourceRowNumber}.`,
          sourceRowNumber: rightRow.sourceRowNumber,
        });
      }
    }
  }
}

function readDate(
  row: ExcelJS.Row,
  binding: ColumnBinding | undefined,
  fieldName: string,
  date1904: boolean,
  issues: ImportIssue[],
  sourceRowNumber: number,
): string | undefined {
  if (!binding) {
    return undefined;
  }
  const cell = row.getCell(binding.column);
  if (hasFormula(cell.value)) {
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

  const parsed = parseExcelDate(cell.value, date1904);
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
  row: ExcelJS.Row,
  binding: ColumnBinding | undefined,
  fieldName: string,
  issues: ImportIssue[],
  sourceRowNumber: number,
): string {
  if (!binding) {
    return "";
  }
  const cell = row.getCell(binding.column);
  if (hasFormula(cell.value)) {
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
  row: ExcelJS.Row,
  binding: ColumnBinding | undefined,
): string | undefined {
  if (!binding) {
    return undefined;
  }
  const value = cellText(row.getCell(binding.column)).trim();
  return value || undefined;
}

function parseExcelDate(value: ExcelJS.CellValue, date1904: boolean): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const epochOffset = date1904 ? 24_107 : 25_569;
    const date = new Date(Math.round((value - epochOffset) * 86_400_000));
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const candidate = value.trim();
    const date = new Date(`${candidate}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === candidate
      ? candidate
      : undefined;
  }
  return undefined;
}

function readRawRow(row: ExcelJS.Row, headerRow: ExcelJS.Row): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  const maximumColumn = Math.max(headerRow.cellCount, row.cellCount);
  for (let column = 1; column <= maximumColumn; column += 1) {
    const header = cellText(headerRow.getCell(column)).trim() || `column_${column}`;
    const value = serializeCellValue(row.getCell(column).value);
    if (value !== null && value !== "") {
      raw[header] = value;
    }
  }
  return raw;
}

function serializeCellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value !== "object") {
    return value;
  }
  if ("formula" in value) {
    return { formula: value.formula, result: serializeUnknown(value.result) };
  }
  if ("richText" in value) {
    return value.richText.map((part) => part.text).join("");
  }
  if ("text" in value) {
    return value.text;
  }
  return serializeUnknown(value);
}

function serializeUnknown(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return value === undefined ? null : String(value);
}

function hasMappedValue(row: ExcelJS.Row, mapping: ColumnMapping): boolean {
  return Object.values(mapping).some((binding) =>
    binding ? cellText(row.getCell(binding.column)).trim() !== "" : false,
  );
}

function hasFormula(value: ExcelJS.CellValue): value is ExcelJS.CellFormulaValue {
  return typeof value === "object" && value !== null && "formula" in value;
}

function cellText(cell: ExcelJS.Cell): string {
  return cell.text ?? "";
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

function normalizeRegion(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
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
    Object.entries(mapping).filter((entry): entry is [string, ColumnBinding] => Boolean(entry[1])),
  );
}
