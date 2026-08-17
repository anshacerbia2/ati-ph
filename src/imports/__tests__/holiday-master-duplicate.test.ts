import { utils, write } from "xlsx";
import { describe, expect, it } from "vitest";

import { computeBusinessContentSha256 } from "@/imports/business-content";
import { parseHolidayWorkbook } from "@/imports/holiday-workbook";

const REGION_ALIASES = new Map<string, string>([
  ["au", "AU"],
  ["australia", "AU"],
]);

async function businessHash(
  bytes: Uint8Array,
): Promise<string | null> {
  const parsed = await parseHolidayWorkbook(bytes, {
    regionAliases: REGION_ALIASES,
    rejectSampleRows: true,
  });

  return computeBusinessContentSha256(parsed.rows);
}

describe("Holiday_Master duplicate identity", () => {
  it("ignores governed metadata and unrelated sheets", async () => {
    const governed = workbookBytes({
      includeMetadata: true,
      includeUnrelatedSheet: false,
    });
    const metadataRemoved = workbookBytes({
      includeMetadata: false,
      includeUnrelatedSheet: false,
    });
    const unrelatedSheetAdded = workbookBytes({
      includeMetadata: false,
      includeUnrelatedSheet: true,
    });

    const governedHash = await businessHash(governed);

    expect(governedHash).not.toBeNull();
    expect(await businessHash(metadataRemoved)).toBe(governedHash);
    expect(await businessHash(unrelatedSheetAdded)).toBe(governedHash);
  });

  it("changes only when authoritative Holiday_Master business content changes", async () => {
    const first = await businessHash(
      workbookBytes({
        includeMetadata: true,
        includeUnrelatedSheet: false,
        endDate: "2027-01-01",
      }),
    );
    const changed = await businessHash(
      workbookBytes({
        includeMetadata: false,
        includeUnrelatedSheet: true,
        endDate: "2027-01-02",
      }),
    );

    expect(first).not.toBeNull();
    expect(changed).not.toBeNull();
    expect(changed).not.toBe(first);
  });
});

function workbookBytes({
  includeMetadata,
  includeUnrelatedSheet,
  endDate = "2027-01-01",
}: {
  includeMetadata: boolean;
  includeUnrelatedSheet: boolean;
  endDate?: string;
}): Uint8Array {
  const workbook = utils.book_new();
  const holidaySheet = utils.aoa_to_sheet([
    [
      "Region",
      "PH Name",
      "PH Start Date",
      "PH End Date",
      "Remarks",
      "Day",
      "Tag",
    ],
    [
      "Australia",
      "New Year",
      "2027-01-01",
      endDate,
      "Evidence only",
      "Friday",
      "Weekday",
    ],
  ]);

  utils.book_append_sheet(workbook, holidaySheet, "Holiday_Master");

  if (includeMetadata) {
    utils.book_append_sheet(
      workbook,
      utils.aoa_to_sheet([
        ["Key", "Value"],
        ["schema_name", "ati-public-holiday-import"],
        ["schema_version", "1.0"],
        ["template_type", "PUBLIC_HOLIDAY_IMPORT"],
        ["data_sheet", "Holiday_Master"],
      ]),
      "_ATI_PH_META",
    );
  }

  if (includeUnrelatedSheet) {
    utils.book_append_sheet(
      workbook,
      utils.aoa_to_sheet([
        ["This sheet is not part of holiday duplicate identity"],
        ["changed evidence"],
      ]),
      "Other_Sheet",
    );
  }

  return new Uint8Array(
    write(workbook, {
      type: "array",
      bookType: "xlsx",
    }),
  );
}
