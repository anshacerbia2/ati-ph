import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("import submit preflight", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/imports/route.ts"),
    "utf8",
  );

  it("checks exact bytes then authoritative Holiday_Master business content before advisory preview validation", () => {
    const rawHash = source.indexOf('const sha256 = createHash("sha256")');
    const exactLookup = source.indexOf(
      "const duplicate = await findExactDuplicate(db, sha256);",
    );
    const serverParse = source.indexOf(
      "const authoritativeBusinessPreview = await parseHolidayWorkbook(bytes, {",
    );
    const businessHash = source.indexOf(
      "businessContentSha256 = computeBusinessContentSha256(",
    );
    const businessLookup = source.indexOf(
      "const businessDuplicate = await findBusinessDuplicate(",
    );
    const previewParse = source.indexOf(
      "preview = parseClientPreviewJson(previewText);",
    );
    const previewHash = source.indexOf(
      "const clientPreviewSha256 = computePreviewSha256(preview);",
    );

    expect(rawHash).toBeGreaterThanOrEqual(0);
    expect(exactLookup).toBeGreaterThan(rawHash);
    expect(serverParse).toBeGreaterThan(exactLookup);
    expect(businessHash).toBeGreaterThan(serverParse);
    expect(businessLookup).toBeGreaterThan(businessHash);
    expect(previewParse).toBeGreaterThan(businessLookup);
    expect(previewHash).toBeGreaterThan(previewParse);
  });

  it("rechecks exact and Holiday_Master duplicates under the same transaction-scoped advisory lock", () => {
    const lockBasis = source.indexOf(
      "const duplicateLockHash = businessContentSha256 ?? sha256;",
    );
    const lock = source.indexOf("pg_advisory_xact_lock");
    const concurrentExactLookup = source.indexOf(
      "const concurrentDuplicate = await findExactDuplicate(",
    );
    const concurrentBusinessLookup = source.indexOf(
      "const concurrentBusinessDuplicate = await findBusinessDuplicate(",
    );
    const batchCreate = source.indexOf(
      "await transaction.importBatch.create({",
    );

    expect(lockBasis).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(lockBasis);
    expect(concurrentExactLookup).toBeGreaterThan(lock);
    expect(concurrentBusinessLookup).toBeGreaterThan(concurrentExactLookup);
    expect(batchCreate).toBeGreaterThan(concurrentBusinessLookup);
  });

  it("persists the Holiday_Master business hash on the initial batch", () => {
    const batchCreate = source.indexOf(
      "await transaction.importBatch.create({",
    );
    const persistedBusinessHash = source.indexOf(
      "businessContentSha256,",
      batchCreate,
    );

    expect(batchCreate).toBeGreaterThanOrEqual(0);
    expect(persistedBusinessHash).toBeGreaterThan(batchCreate);
  });

  it("hard-blocks same Holiday_Master data and keeps retired overrides disabled", () => {
    expect(source).toContain('code: "SAME_HOLIDAY_DATA"');
    expect(source).not.toContain('formData.get("confirmDuplicate")');
    expect(source).not.toContain("Client preview schema is not supported.");
  });
});
