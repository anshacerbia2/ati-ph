import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const worker = fs.readFileSync(
  path.join(
    process.cwd(),
    "src/worker/main.ts",
  ),
  "utf8",
);

describe("worker STREAM notification delivery contract", () => {
  it("claims and executes delivery only in STREAM mode", () => {
    expect(worker).toContain(
      "claimDueNotificationJobs",
    );
    expect(worker).toContain(
      "executeStreamNotificationDelivery",
    );
    expect(worker).toContain(
      'emailDelivery?.mode === "STREAM"',
    );
  });

  it("does not authorize SMTP notification execution yet", () => {
    expect(worker).toContain(
      "SMTP transport configured, but notification external delivery remains gated",
    );
    expect(worker).not.toContain(
      'emailDelivery.mode === "SMTP" &&',
    );
  });
});
