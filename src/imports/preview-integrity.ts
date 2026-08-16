import { createHash } from "node:crypto";

import type { ParsedHolidayWorkbook } from "@/imports/contracts";

export function computePreviewSha256(
  preview: ParsedHolidayWorkbook,
): string {
  return createHash("sha256")
    .update(stableStringify(preview))
    .digest("hex");
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
