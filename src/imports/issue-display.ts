const ISSUE_TITLES: Readonly<Record<string, string>> = {
  AMBIGUOUS_HEADER: "Ambiguous column mapping",
  CROSS_YEAR_PERIOD: "Holiday period crosses calendar years",
  DATE_PERIOD_TOO_LONG: "Holiday period exceeds safety limit",
  DERIVED_COLUMNS_IGNORED: "Derived Day and Tag columns ignored",
  DUPLICATE_HOLIDAY_OCCURRENCE: "Duplicate holiday occurrence",
  END_DATE_BEFORE_START_DATE: "End date is before start date",
  FORMULA_NOT_ALLOWED: "Formula is not allowed",
  INVALID_DATE: "Invalid holiday date",
  LEGACY_SCHEMA_ASSUMED: "Legacy workbook format detected",
  MISSING_REQUIRED_HEADER: "Required column missing",
  MULTI_REGION_NORMALIZED: "Multiple regions normalized",
  OVERLAPPING_HOLIDAY_OCCURRENCE: "Overlapping holiday occurrence",
  REQUIRED_VALUE_MISSING: "Required value missing",
  SAMPLE_ROW_DETECTED: "Sample or test row detected",
  UNKNOWN_REGION: "Unknown calendar region",
  VALUE_TOO_LONG: "Value exceeds allowed length",
};

const FIELD_LABELS: Readonly<Record<string, string>> = {
  endDate: "End date",
  holidayName: "Holiday name",
  notes: "Notes",
  regionCode: "Region",
  sourceReference: "Source reference",
  sourceRowId: "Source row ID",
  startDate: "Start date",
};

export function validationIssueTitle(code: string): string {
  const normalized = code.trim().toUpperCase();
  return ISSUE_TITLES[normalized] ?? humanizeIdentifier(code);
}

export function validationFieldLabel(fieldName: string): string {
  return FIELD_LABELS[fieldName] ?? humanizeIdentifier(fieldName);
}

function humanizeIdentifier(value: string): string {
  const humanized = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (!humanized) {
    return "Validation issue";
  }

  return humanized.charAt(0).toUpperCase() + humanized.slice(1);
}
