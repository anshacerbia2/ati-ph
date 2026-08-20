import { readFileSync } from "node:fs";
import {
  describe,
  expect,
  it,
} from "vitest";

describe("worker SMTP release contract", () => {
  const worker = readFileSync(
    "src/worker/main.ts",
    "utf8",
  );

  it("wires SMTP only behind explicit automatic release control", () => {
    expect(worker).toContain(
      "executeSmtpNotificationDelivery",
    );
    expect(worker).toContain(
      "resolveEmailAutomaticDeliveryRelease",
    );
    expect(worker).toContain(
      "canExecuteSmtpAutomatically",
    );
  });

  it("marks SMTP claims as unsafe to recover by blind retry", () => {
    expect(worker).toMatch(
      /mode === "SMTP"[\s\S]*leaseRetrySafe: false/,
    );
  });
});
