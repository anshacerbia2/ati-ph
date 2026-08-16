import JSZip from "jszip";

import { WorkbookContractError } from "@/imports/holiday-workbook";

export async function assertSafeXlsxPackage(
  bytes: Uint8Array,
): Promise<void> {
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

  const entryNames = Object.keys(archive.files).map((name) =>
    name.toLowerCase(),
  );

  if (entryNames.some((name) => name.endsWith("vbaproject.bin"))) {
    throw new WorkbookContractError(
      "Macro-enabled workbooks are not permitted.",
    );
  }

  const contentTypes = archive.file("[Content_Types].xml");
  const contentTypeText = contentTypes
    ? (await contentTypes.async("text")).toLowerCase()
    : "";

  if (contentTypeText.includes("macroenabled")) {
    throw new WorkbookContractError(
      "Macro-enabled workbooks are not permitted.",
    );
  }
}
