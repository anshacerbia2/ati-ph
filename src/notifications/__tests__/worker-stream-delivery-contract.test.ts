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
  it("claims and executes delivery in STREAM mode", () => {
    expect(worker).toContain(
      "claimDueNotificationJobs",
    );
    expect(worker).toContain(
      "executeStreamNotificationDelivery",
    );
    expect(worker).toContain(
      'emailDelivery?.mode === "STREAM"',
    );
    expect(worker).toContain(
      "leaseRetrySafe: true",
    );
  });

  it("authorizes SMTP only behind explicit fail-closed release controls", () => {
    expect(worker).toContain(
      'emailDelivery?.mode === "SMTP"',
    );
    expect(worker).toContain(
      "resolveEmailAutomaticDeliveryRelease",
    );
    expect(worker).toContain(
      "canExecuteSmtpAutomatically",
    );
    expect(worker).toContain(
      "executeSmtpNotificationDelivery",
    );
    expect(worker).toContain(
      "leaseRetrySafe: false",
    );
  });
});
