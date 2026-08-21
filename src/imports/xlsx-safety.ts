import JSZip from "jszip";

import { WorkbookContractError } from "@/imports/holiday-workbook";

/**
 * Content types that name a macro-enabled workbook part: `.xlsm`, `.xltm`, `.xlam` and
 * the binary `.xlsb`. Matched case-insensitively, because the casing in the wild is not
 * consistent.
 */
const MACRO_ENABLED_CONTENT_TYPE = /macroenabled/i;

/**
 * `<Override PartName="/x" ContentType="y"/>` — a declaration about a part that exists.
 */
const OVERRIDE = /<Override\b[^>]*\bContentType="([^"]*)"[^>]*\/?>/gi;

/**
 * `<Default Extension="bin" ContentType="y"/>` — a declaration about what a part *would*
 * be if the package contained one with that extension.
 */
const DEFAULT_MAPPING =
  /<Default\b[^>]*\bExtension="([^"]*)"[^>]*\bContentType="([^"]*)"[^>]*\/?>/gi;

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
    ? await contentTypes.async("text")
    : "";

  if (declaresMacroEnabledPart(contentTypeText, entryNames)) {
    throw new WorkbookContractError(
      "Macro-enabled workbooks are not permitted.",
    );
  }
}

/**
 * Whether `[Content_Types].xml` describes a macro-enabled part the package actually has.
 *
 * ## Why this is not a substring search
 *
 * It was `contentTypeText.includes("macroenabled")`, over the whole document. That
 * rejected **every workbook SheetJS writes**, because its boilerplate content types
 * include a mapping for the binary format whether or not the package uses it:
 *
 * ```xml
 * <Default Extension="bin" ContentType="application/vnd.ms-excel.sheet.binary.macroEnabled.main"/>
 * ```
 *
 * A `Default` says what a part *would* be if one had that extension. With no `.bin`
 * entry in the archive — and there was none — it describes nothing. The upload was
 * refused with "review the workbook and try again", pointing the operator at content
 * that was correct, which is the worst kind of validation error: confident, and about
 * the wrong thing.
 *
 * ## What is checked instead
 *
 * - **Every `Override`**, unconditionally. An override names a part by path, so a
 *   macro-enabled content type there is a statement that such a part is present. This is
 *   what actually identifies `.xlsm`, `.xltm` and `.xlam`.
 * - **A `Default`, only when the package contains a part with that extension.** This
 *   keeps the original intent — a `.xlsb` whose macro-enabled type arrives through the
 *   extension mapping is still refused — without inventing a part that is not there.
 *
 * `vbaProject.bin` is checked separately by the caller and is the direct evidence; this
 * covers the declarations, so a package that renamed the macro part is still refused.
 */
function declaresMacroEnabledPart(
  contentTypeText: string,
  entryNames: readonly string[],
): boolean {
  for (const match of contentTypeText.matchAll(OVERRIDE)) {
    if (MACRO_ENABLED_CONTENT_TYPE.test(match[1])) return true;
  }

  for (const match of contentTypeText.matchAll(DEFAULT_MAPPING)) {
    const extension = match[1].toLowerCase().replace(/^\./, "");
    const contentType = match[2];

    if (!MACRO_ENABLED_CONTENT_TYPE.test(contentType)) continue;
    if (!extension) continue;

    const packageUsesExtension = entryNames.some((name) =>
      name.endsWith(`.${extension}`),
    );

    if (packageUsesExtension) return true;
  }

  return false;
}
