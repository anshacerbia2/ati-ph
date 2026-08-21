import JSZip from "jszip";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { WorkbookContractError } from "@/imports/holiday-workbook";
import { assertSafeXlsxPackage } from "@/imports/xlsx-safety";

const REFUSED = new WorkbookContractError(
  "Macro-enabled workbooks are not permitted.",
);

async function packageWith(
  files: Record<string, string>,
): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  return zip.generateAsync({ type: "uint8array" });
}

function types(inner: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    inner +
    "</Types>"
  );
}

describe("assertSafeXlsxPackage", () => {
  it("accepts a workbook written by the library this project uses", async () => {
    /*
     * The regression this file exists for.
     *
     * SheetJS writes `<Default Extension="bin" ContentType="…macroEnabled.main"/>` into
     * every package, whether or not one contains a `.bin` part. A substring search for
     * "macroenabled" over `[Content_Types].xml` therefore refused every workbook it
     * produced — including the import fixture in `docs/` — with a message telling the
     * operator to review a workbook that was correct.
     *
     * The suite never caught it because the safety check was only ever run against
     * hand-built JSZip archives; the parser tests build real workbooks and do not call
     * it. This test closes that gap by putting the two together.
     */
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Region", "PH Name", "PH Start Date", "PH End Date"],
      ["SG", "A Holiday", "2027-01-01", "2027-01-01"],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Holiday_Master");

    const bytes = new Uint8Array(
      XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
    );

    await expect(assertSafeXlsxPackage(bytes)).resolves.toBeUndefined();
  });

  it("rejects a package containing VBA", async () => {
    const bytes = await packageWith({
      "[Content_Types].xml": types(""),
      "xl/vbaProject.bin": "macro",
    });

    await expect(assertSafeXlsxPackage(bytes)).rejects.toThrow(REFUSED);
  });

  it("rejects a workbook whose own part is declared macro-enabled", async () => {
    /*
     * An `Override` names a part by path, so this is a statement that the part exists.
     * It is what identifies `.xlsm`, and it holds even when the macro payload has been
     * renamed away from `vbaProject.bin`.
     */
    const bytes = await packageWith({
      "[Content_Types].xml": types(
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/>',
      ),
      "xl/workbook.xml": "<workbook/>",
    });

    await expect(assertSafeXlsxPackage(bytes)).rejects.toThrow(REFUSED);
  });

  it("rejects a macro-enabled default mapping when the package uses that extension", async () => {
    /*
     * The half of the original check that was doing real work: a `.xlsb` whose
     * macro-enabled type arrives through the extension mapping rather than an override.
     */
    const bytes = await packageWith({
      "[Content_Types].xml": types(
        '<Default Extension="bin" ContentType="application/vnd.ms-excel.sheet.binary.macroEnabled.main"/>',
      ),
      "xl/workbook.bin": "binary sheet",
    });

    await expect(assertSafeXlsxPackage(bytes)).rejects.toThrow(REFUSED);
  });

  it("ignores a macro-enabled default mapping for an extension no part uses", async () => {
    const bytes = await packageWith({
      "[Content_Types].xml": types(
        '<Default Extension="bin" ContentType="application/vnd.ms-excel.sheet.binary.macroEnabled.main"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
      ),
      "xl/workbook.xml": "<workbook/>",
    });

    await expect(assertSafeXlsxPackage(bytes)).resolves.toBeUndefined();
  });

  it("refuses anything that is not a ZIP local file header", async () => {
    await expect(
      assertSafeXlsxPackage(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
    ).rejects.toThrow(
      new WorkbookContractError("File is not a readable XLSX ZIP package."),
    );
  });

  it("refuses a truncated or corrupt package", async () => {
    const intact = await packageWith({
      "[Content_Types].xml": types(""),
    });
    const truncated = intact.slice(0, Math.floor(intact.length / 2));

    await expect(assertSafeXlsxPackage(truncated)).rejects.toThrow(
      new WorkbookContractError("Workbook is corrupt or encrypted."),
    );
  });
});
