import type {
  NormalizedHolidayRow,
  ValidationSeverity,
} from "@/imports/contracts";

export type StagingCorrectionInput = {
  holidayName: string;
  regionCodes: string[];
  startDate: string;
  endDate: string;
  sourceReference?: string;
  notes?: string;
};

export type StagingRowCandidate = {
  id: string;
  sourceRowNumber: number;
  status: "VALID" | "INVALID" | "EXCLUDED";
  normalizedData: NormalizedHolidayRow;
  excludedReason?: string | null;
};

export type StagingValidationIssue = {
  rowId: string;
  sourceRowNumber: number;
  severity: ValidationSeverity;
  code: string;
  fieldName?: string;
  rejectedValue?: string;
  message: string;
};

export type StagingValidationResult = {
  issues: StagingValidationIssue[];
  statuses: Map<string, "VALID" | "INVALID" | "EXCLUDED">;
  validRows: number;
  invalidRows: number;
  warningCount: number;
};

export function parseStagingCorrection(
  current: NormalizedHolidayRow,
  input: unknown,
):
  | { ok: true; value: NormalizedHolidayRow }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "correction must be an object." };
  }

  const value = input as Record<string, unknown>;
  const holidayName =
    typeof value.holidayName === "string"
      ? value.holidayName.trim()
      : "";

  if (!holidayName || holidayName.length > 200) {
    return {
      ok: false,
      error: "holidayName must contain 1 to 200 characters.",
    };
  }

  if (
    !Array.isArray(value.regionCodes) ||
    value.regionCodes.some((code) => typeof code !== "string")
  ) {
    return {
      ok: false,
      error: "regionCodes must be an array of canonical region codes.",
    };
  }

  const regionCodes = [
    ...new Set(
      value.regionCodes
        .map((code) => (code as string).trim().toUpperCase())
        .filter(Boolean),
    ),
  ];

  if (
    regionCodes.length === 0 ||
    regionCodes.length > 20 ||
    regionCodes.some(
      (code) => code.length > 16 || !/^[A-Z0-9_-]+$/.test(code),
    )
  ) {
    return {
      ok: false,
      error:
        "Choose between 1 and 20 valid canonical calendar-region codes.",
    };
  }

  const startDate =
    typeof value.startDate === "string"
      ? value.startDate.trim()
      : "";
  const endDate =
    typeof value.endDate === "string"
      ? value.endDate.trim()
      : "";

  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    return {
      ok: false,
      error: "startDate and endDate must use ISO YYYY-MM-DD.",
    };
  }

  const sourceReference = optionalText(
    value.sourceReference,
    500,
    "sourceReference",
  );
  if (!sourceReference.ok) {
    return sourceReference;
  }

  const notes = optionalText(value.notes, 2_000, "notes");
  if (!notes.ok) {
    return notes;
  }

  return {
    ok: true,
    value: {
      ...current,
      regionCodes,
      holidayName,
      normalizedHolidayName: normalizeHolidayName(holidayName),
      startDate,
      endDate,
      calendarYear: Number(startDate.slice(0, 4)),
      sourceReference: sourceReference.value,
      notes: notes.value,
    },
  };
}

export function validateStagingRows(
  rows: readonly StagingRowCandidate[],
  activeRegionCodes: ReadonlySet<string>,
  maximumPeriodDays = 31,
): StagingValidationResult {
  const issues: StagingValidationIssue[] = [];
  const activeRows = rows.filter((row) => row.status !== "EXCLUDED");

  for (const row of activeRows) {
    const value = row.normalizedData;

    if (!value.holidayName.trim()) {
      pushIssue(issues, row, {
        severity: "ERROR",
        code: "REQUIRED_VALUE_MISSING",
        fieldName: "holidayName",
        message: "holidayName is required.",
      });
    }

    if (/(?:\bsample\b|xxx)/i.test(value.holidayName)) {
      pushIssue(issues, row, {
        severity: "ERROR",
        code: "SAMPLE_ROW_DETECTED",
        fieldName: "holidayName",
        rejectedValue: value.holidayName,
        message:
          "Sample or test staging rows cannot progress to approval.",
      });
    }

    if (value.regionCodes.length === 0) {
      pushIssue(issues, row, {
        severity: "ERROR",
        code: "REQUIRED_VALUE_MISSING",
        fieldName: "regionCode",
        message: "At least one canonical region is required.",
      });
    }

    for (const code of value.regionCodes) {
      if (!activeRegionCodes.has(code)) {
        pushIssue(issues, row, {
          severity: "ERROR",
          code: "UNKNOWN_REGION",
          fieldName: "regionCode",
          rejectedValue: code,
          message:
            `Region "${code}" is not an active canonical calendar region.`,
        });
      }
    }

    const startDate = value.startDate;
    const endDate = value.endDate;

    if (!startDate || !isIsoDate(startDate)) {
      pushIssue(issues, row, {
        severity: "ERROR",
        code: "INVALID_DATE",
        fieldName: "startDate",
        rejectedValue: startDate,
        message: "startDate must use ISO YYYY-MM-DD.",
      });
    }

    if (!endDate || !isIsoDate(endDate)) {
      pushIssue(issues, row, {
        severity: "ERROR",
        code: "INVALID_DATE",
        fieldName: "endDate",
        rejectedValue: endDate,
        message: "endDate must use ISO YYYY-MM-DD.",
      });
    }

    if (startDate && endDate && isIsoDate(startDate) && isIsoDate(endDate)) {
      const durationDays = differenceInDays(startDate, endDate) + 1;

      if (durationDays < 1) {
        pushIssue(issues, row, {
          severity: "ERROR",
          code: "END_DATE_BEFORE_START_DATE",
          fieldName: "endDate",
          rejectedValue: endDate,
          message: "End date must be on or after start date.",
        });
      } else if (durationDays > maximumPeriodDays) {
        pushIssue(issues, row, {
          severity: "ERROR",
          code: "DATE_PERIOD_TOO_LONG",
          fieldName: "endDate",
          rejectedValue: endDate,
          message:
            `Holiday period exceeds the ${maximumPeriodDays}-day safety limit.`,
        });
      }

      if (startDate.slice(0, 4) !== endDate.slice(0, 4)) {
        pushIssue(issues, row, {
          severity: "WARNING",
          code: "CROSS_YEAR_PERIOD",
          fieldName: "endDate",
          rejectedValue: endDate,
          message: "Holiday period crosses a calendar-year boundary.",
        });
      }
    }
  }

  const identities = new Map<string, StagingRowCandidate>();

  for (const row of activeRows) {
    const value = row.normalizedData;

    if (
      !value.startDate ||
      !value.endDate ||
      value.regionCodes.length === 0
    ) {
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
      pushIssue(issues, row, {
        severity: "ERROR",
        code: "DUPLICATE_HOLIDAY_OCCURRENCE",
        message:
          `Duplicates source row ${prior.sourceRowNumber}.`,
      });
    } else {
      identities.set(key, row);
    }
  }

  for (
    let leftIndex = 0;
    leftIndex < activeRows.length;
    leftIndex += 1
  ) {
    const leftRow = activeRows[leftIndex];
    const left = leftRow.normalizedData;

    if (
      !left.startDate ||
      !left.endDate ||
      !left.normalizedHolidayName
    ) {
      continue;
    }

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < activeRows.length;
      rightIndex += 1
    ) {
      const rightRow = activeRows[rightIndex];
      const right = rightRow.normalizedData;

      if (
        left.normalizedHolidayName !==
          right.normalizedHolidayName ||
        !right.startDate ||
        !right.endDate ||
        !left.regionCodes.some((code) =>
          right.regionCodes.includes(code),
        )
      ) {
        continue;
      }

      if (
        left.startDate <= right.endDate &&
        right.startDate <= left.endDate
      ) {
        pushIssue(issues, rightRow, {
          severity: "WARNING",
          code: "OVERLAPPING_HOLIDAY_OCCURRENCE",
          message:
            `Overlaps another occurrence of the same holiday at source row ${leftRow.sourceRowNumber}.`,
        });
      }
    }
  }

  const statuses = new Map<
    string,
    "VALID" | "INVALID" | "EXCLUDED"
  >();

  for (const row of rows) {
    if (row.status === "EXCLUDED") {
      statuses.set(row.id, "EXCLUDED");
      continue;
    }

    statuses.set(
      row.id,
      issues.some(
        (issue) =>
          issue.rowId === row.id &&
          issue.severity === "ERROR",
      )
        ? "INVALID"
        : "VALID",
    );
  }

  return {
    issues,
    statuses,
    validRows: [...statuses.values()].filter(
      (status) => status === "VALID",
    ).length,
    invalidRows: [...statuses.values()].filter(
      (status) => status === "INVALID",
    ).length,
    warningCount: issues.filter(
      (issue) => issue.severity === "WARNING",
    ).length,
  };
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function optionalText(
  value: unknown,
  maxLength: number,
  fieldName: string,
):
  | { ok: true; value?: string }
  | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: undefined };
  }

  if (typeof value !== "string") {
    return {
      ok: false,
      error: `${fieldName} must be text.`,
    };
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return {
      ok: false,
      error:
        `${fieldName} cannot exceed ${maxLength} characters.`,
    };
  }

  return { ok: true, value: trimmed || undefined };
}

function pushIssue(
  issues: StagingValidationIssue[],
  row: StagingRowCandidate,
  issue: Omit<
    StagingValidationIssue,
    "rowId" | "sourceRowNumber"
  >,
): void {
  issues.push({
    rowId: row.id,
    sourceRowNumber: row.sourceRowNumber,
    ...issue,
  });
}

function normalizeHolidayName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function differenceInDays(
  startDate: string,
  endDate: string,
): number {
  return (
    (Date.parse(`${endDate}T00:00:00.000Z`) -
      Date.parse(`${startDate}T00:00:00.000Z`)) /
    86_400_000
  );
}
