import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const pilot = fs.readFileSync(
  path.join(root, "scripts/notification-smtp-pilot.ts"),
  "utf8",
);
const worker = fs.readFileSync(
  path.join(root, "src/worker/main.ts"),
  "utf8",
);
const packageJson = fs.readFileSync(
  path.join(root, "package.json"),
  "utf8",
);

describe("controlled NotificationJob SMTP pilot contract", () => {
  it("uses frozen job content but overrides delivery to one internal pilot recipient", () => {
    expect(pilot).toContain("contentSnapshot: job.contentSnapshot");
    expect(pilot).toContain("contentSha256: job.contentSha256");
    expect(pilot).toContain(
      "message.to = [{ email: gate.recipient }]",
    );
    expect(pilot).toContain("message.cc = []");
    expect(pilot).toContain(
      '"X-ATI-Content-Mode": "GOVERNED_TEMPLATE_SMTP_PILOT"',
    );
  });

  it("does not mutate durable NotificationJob or delivery-attempt state", () => {
    expect(pilot).not.toContain("notificationJob.update");
    expect(pilot).not.toContain("deliveryAttempt.create");
    expect(pilot).not.toContain("completeNotificationDeliveryAttempt");
    expect(pilot).not.toContain("claimDueNotificationJobs");
  });

  it("keeps the pilot isolated while automatic SMTP requires separate release controls", () => {
    expect(worker).toContain(
      "executeSmtpNotificationDelivery",
    );
    expect(worker).toContain(
      "resolveEmailAutomaticDeliveryRelease",
    );
    expect(worker).toContain(
      "canExecuteSmtpAutomatically",
    );
    expect(worker).toContain(
      "leaseRetrySafe: false",
    );
  });

  it("exposes the pilot only as an explicit manual command", () => {
    expect(packageJson).toContain('"notification:smtp:pilot"');
    expect(pilot).toContain('process.argv.includes("--send")');
    expect(pilot).toContain('argValue("--job")');
  });
});
