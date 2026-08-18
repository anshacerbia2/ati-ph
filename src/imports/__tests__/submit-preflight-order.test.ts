import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("authoritative import submit boundary", () => {
  const routeSource = fs.readFileSync(
    path.join(
      process.cwd(),
      "src/app/api/imports/route.ts",
    ),
    "utf8",
  );
  const workspaceSource = fs.readFileSync(
    path.join(
      process.cwd(),
      "src/components/ph-dashboard/ImportWorkspace.tsx",
    ),
    "utf8",
  );
  const workerSource = fs.readFileSync(
    path.join(process.cwd(), "src/worker/main.ts"),
    "utf8",
  );
  const schemaSource = fs.readFileSync(
    path.join(process.cwd(), "prisma/schema.prisma"),
    "utf8",
  );

  it("sends only the raw XLSX from the browser", () => {
    expect(workspaceSource).toContain(
      'formData.set("file", file);',
    );
    expect(workspaceSource).not.toContain(
      'formData.set("preview"',
    );
  });

  it("parses the workbook once on the server and stages that same authoritative result", () => {
    const parseIndex = routeSource.indexOf(
      "authoritativePreview = await parseHolidayWorkbook(bytes, {",
    );
    const batchCreate = routeSource.indexOf(
      "await transaction.importBatch.create({",
    );
    const rowCreate = routeSource.indexOf(
      "await transaction.importRow.createMany({",
    );

    expect(parseIndex).toBeGreaterThanOrEqual(0);
    expect(batchCreate).toBeGreaterThan(parseIndex);
    expect(rowCreate).toBeGreaterThan(batchCreate);
    expect(routeSource).toContain(
      "schemaName: authoritativePreview.schemaName",
    );
    expect(routeSource).toContain(
      "data: authoritativePreview.rows.map((row) => ({",
    );
    expect(
      routeSource.match(/parseHolidayWorkbook\(bytes/g),
    ).toHaveLength(1);
  });

  it("keeps duplicate rechecks and ImportBatchValidated inside the transaction", () => {
    const lock = routeSource.indexOf(
      "pg_advisory_xact_lock",
    );
    const exactRecheck = routeSource.indexOf(
      "const concurrentDuplicate = await findExactDuplicate(",
    );
    const businessRecheck = routeSource.indexOf(
      "const concurrentBusinessDuplicate =",
    );
    const batchCreate = routeSource.indexOf(
      "await transaction.importBatch.create({",
    );
    const outboxCreate = routeSource.indexOf(
      "await transaction.outboxEvent.create({",
    );

    expect(lock).toBeGreaterThanOrEqual(0);
    expect(exactRecheck).toBeGreaterThan(lock);
    expect(businessRecheck).toBeGreaterThan(exactRecheck);
    expect(batchCreate).toBeGreaterThan(businessRecheck);
    expect(outboxCreate).toBeGreaterThan(batchCreate);
    expect(routeSource).toContain(
      'topic: "ImportBatchValidated"',
    );
  });

  it("retires browser preview hashes and asynchronous worker verification", () => {
    for (const retired of [
      "clientPreviewSha256",
      "verificationStartedAt",
      "computePreviewSha256",
      "parseClientPreviewJson",
      "verifyPendingImports",
      "verifyOnePendingImport",
    ]) {
      expect(routeSource).not.toContain(retired);
      expect(workerSource).not.toContain(retired);
      expect(schemaSource).not.toContain(retired);
    }

    expect(schemaSource).toMatch(
      /validatedAt\s+DateTime\?/,
    );
    expect(schemaSource).not.toMatch(
      /status\s+ImportBatchStatus\s+@default\(UPLOADED\)/,
    );
    expect(routeSource).toContain('status: "VALIDATED"');
    expect(routeSource).toContain("validatedAt: now");
  });
});
