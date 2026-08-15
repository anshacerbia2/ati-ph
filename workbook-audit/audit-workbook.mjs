import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = process.argv[2];
const outputDir = process.argv[3] ?? "output";

if (!inputPath) {
  throw new Error("Usage: audit-workbook.mjs <input.xlsx> [output-dir]");
}

await fs.mkdir(outputDir, { recursive: true });

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const summary = await workbook.inspect({
  kind: "workbook,sheet,table,definedName,drawing",
  maxChars: 24000,
  tableMaxRows: 12,
  tableMaxCols: 30,
  tableMaxCellChars: 160,
});

const sheetOverview = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 12000,
});

const sheets = [];
for (const sheet of workbook.worksheets.items) {
  const usedRange = sheet.getUsedRange(false);
  const usedAddress = usedRange?.address ?? null;
  const values = usedRange?.values ?? [];
  const formulas = usedRange?.formulas ?? [];
  const rowCount = values.length;
  const columnCount = values.reduce((max, row) => Math.max(max, row.length), 0);

  const region = usedAddress
    ? await workbook.inspect({
        kind: "region",
        sheetId: sheet.name,
        range: usedAddress,
        maxChars: 36000,
        tableMaxRows: 60,
        tableMaxCols: 40,
        tableMaxCellChars: 240,
      })
    : null;

  const formulaInspection = usedAddress
    ? await workbook.inspect({
        kind: "formula",
        sheetId: sheet.name,
        range: usedAddress,
        maxChars: 12000,
        options: { maxResults: 300 },
      })
    : null;

  const styleInspection = usedAddress
    ? await workbook.inspect({
        kind: "computedStyle",
        sheetId: sheet.name,
        range: usedAddress,
        maxChars: 12000,
      })
    : null;

  const safeName = sheet.name.replace(/[<>:"/\\|?*]+/g, "_");
  const preview = await workbook.render({
    sheetName: sheet.name,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  const previewPath = path.join(outputDir, `${safeName}.png`);
  await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

  sheets.push({
    name: sheet.name,
    usedAddress,
    rowCount,
    columnCount,
    values,
    formulas,
    region: region?.ndjson ?? region,
    formulaInspection: formulaInspection?.ndjson ?? formulaInspection,
    styleInspection: styleInspection?.ndjson ?? styleInspection,
    previewPath,
  });
}

await fs.writeFile(
  path.join(outputDir, "audit.json"),
  JSON.stringify(
    {
      source: inputPath,
      summary: summary?.ndjson ?? summary,
      sheetOverview: sheetOverview?.ndjson ?? sheetOverview,
      sheets,
    },
    null,
    2,
  ),
  "utf8",
);

console.log(
  JSON.stringify(
    {
      outputDir,
      sheets: sheets.map(({ name, usedAddress, rowCount, columnCount, previewPath }) => ({
        name,
        usedAddress,
        rowCount,
        columnCount,
        previewPath,
      })),
    },
    null,
    2,
  ),
);
