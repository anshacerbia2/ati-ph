import { createHash } from "node:crypto";

import type { ParsedImportRow } from "@/imports/contracts";

const BUSINESS_CONTENT_HASH_SCHEMA =
  "ati-ph-holiday-business-content-v1";

type CanonicalBusinessRow = {
  regions: string[];
  holidayName: string;
  startDate: string;
  endDate: string;
};

export function computeBusinessContentSha256(
  rows: readonly ParsedImportRow[],
): string | null {
  const canonicalRows = canonicalizeBusinessRows(rows);

  if (!canonicalRows) {
    return null;
  }

  const payload = JSON.stringify({
    hashSchema: BUSINESS_CONTENT_HASH_SCHEMA,
    rows: canonicalRows,
  });

  return createHash("sha256")
    .update(payload, "utf8")
    .digest("hex");
}

export function canonicalizeBusinessRows(
  rows: readonly ParsedImportRow[],
): CanonicalBusinessRow[] | null {
  if (rows.length === 0) {
    return null;
  }

  const canonicalRows: CanonicalBusinessRow[] = [];

  for (const row of rows) {
    const normalized = row.normalizedData;

    if (
      row.status !== "VALID" ||
      !normalized.normalizedHolidayName ||
      !normalized.startDate ||
      !normalized.endDate ||
      normalized.regionCodes.length === 0
    ) {
      return null;
    }

    canonicalRows.push({
      regions: [...new Set(normalized.regionCodes)].sort(),
      holidayName: normalized.normalizedHolidayName,
      startDate: normalized.startDate,
      endDate: normalized.endDate,
    });
  }

  canonicalRows.sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );

  return canonicalRows;
}
