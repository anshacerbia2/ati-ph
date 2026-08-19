import { describe, expect, it } from "vitest";

import { evaluateSmtpPilotGate } from "@/email/smtp-pilot-rules";

describe("notification SMTP pilot gate", () => {
  const base = {
    mode: "SMTP" as const,
    enabled: true,
    fromAddress: "apps@atibusinessgroup.com",
    recipient: "ansha@atibusinessgroup.com",
  };

  it("allows an explicitly enabled same-domain SMTP pilot", () => {
    expect(evaluateSmtpPilotGate(base)).toEqual({
      ok: true,
      fromAddress: "apps@atibusinessgroup.com",
      recipient: "ansha@atibusinessgroup.com",
      domain: "atibusinessgroup.com",
    });
  });

  it("fails closed when the pilot is not explicitly enabled", () => {
    expect(
      evaluateSmtpPilotGate({
        ...base,
        enabled: false,
      }),
    ).toEqual({
      ok: false,
      reason:
        "EMAIL_SMTP_PILOT_ENABLED must be true for the notification SMTP pilot.",
    });
  });

  it("rejects a pilot recipient outside the sender domain", () => {
    expect(
      evaluateSmtpPilotGate({
        ...base,
        recipient: "client@example.com",
      }),
    ).toEqual({
      ok: false,
      reason:
        "Notification SMTP pilot recipient must use the same domain as EMAIL_FROM_ADDRESS.",
    });
  });

  it("rejects non-SMTP delivery modes", () => {
    expect(
      evaluateSmtpPilotGate({
        ...base,
        mode: "STREAM",
      }),
    ).toEqual({
      ok: false,
      reason:
        "EMAIL_DELIVERY_MODE must be SMTP for the notification SMTP pilot.",
    });
  });
});
