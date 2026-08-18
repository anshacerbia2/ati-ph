import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const routeSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/imports/route.ts"),
  "utf8",
);
const correctionSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "src/app/api/imports/[batchId]/rows/[rowId]/route.ts",
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

describe("governed INVALID import semantics", () => {
  it("persists row-level authoritative validation failures instead of returning 422", () => {
    expect(routeSource).toContain(
      "const initialStatus = hasBlockingErrors(authoritativePreview)",
    );
    expect(routeSource).toContain("status: initialStatus");
    expect(routeSource).toContain(
      'initialStatus === "VALIDATED"',
    );
    expect(routeSource).not.toContain(
      "Authoritative server validation found blocking workbook errors. No import was created.",
    );
  });

  it("keeps fatal workbook contract failures as pre-persistence rejection", () => {
    expect(routeSource).toContain(
      "error instanceof WorkbookContractError",
    );
    expect(routeSource).toContain(
      '"WORKBOOK_SERVER_VALIDATION_FAILED"',
    );
    expect(routeSource).toContain('"NO_HOLIDAY_ROWS"');
  });

  it("does not let browser preview errors override server authority", () => {
    expect(workspaceSource).not.toContain(
      "previewHasBlockingErrors",
    );
    expect(workspaceSource).toContain(
      'formData.set("file", file);',
    );
    expect(workspaceSource).toContain(
      'result.batch.status === "INVALID"',
    );
  });

  it("emits ImportBatchValidated when governed correction crosses into VALIDATED", () => {
    expect(correctionSource).toContain(
      'if (nextBatchStatus === "VALIDATED")',
    );
    expect(correctionSource).toContain(
      'topic: "ImportBatchValidated"',
    );
    expect(correctionSource).toContain("validatedAt: now");
  });
});
