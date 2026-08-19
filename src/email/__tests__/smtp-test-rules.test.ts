import { describe, expect, it } from "vitest";

import {
  smtpManualTestDecision,
} from "@/email/smtp-test-rules";

describe("manual SMTP test safety", () => {
  const base = {
    deliveryMode: "SMTP" as const,
    testEnabled: true,
    explicitSendFlag: true,
    fromAddress:
      "apps@atibusinessgroup.com",
    recipient:
      "tester@atibusinessgroup.com",
  };

  it("requires all explicit send gates", () => {
    expect(
      smtpManualTestDecision({
        ...base,
        explicitSendFlag: false,
      }),
    ).toMatchObject({
      ok: false,
    });

    expect(
      smtpManualTestDecision({
        ...base,
        testEnabled: false,
      }),
    ).toMatchObject({
      ok: false,
    });

    expect(
      smtpManualTestDecision({
        ...base,
        deliveryMode: "STREAM",
      }),
    ).toMatchObject({
      ok: false,
    });
  });

  it("allows one explicit same-domain recipient", () => {
    expect(
      smtpManualTestDecision(base),
    ).toEqual({
      ok: true,
      recipient:
        "tester@atibusinessgroup.com",
    });
  });

  it("blocks external-domain recipients", () => {
    const decision =
      smtpManualTestDecision({
        ...base,
        recipient:
          "someone@example.com",
      });

    expect(decision).toMatchObject({
      ok: false,
    });

    if (!decision.ok) {
      expect(
        decision.reasons.join(" "),
      ).toContain("same email domain");
    }
  });

  it("requires an explicit recipient", () => {
    expect(
      smtpManualTestDecision({
        ...base,
        recipient: undefined,
      }),
    ).toMatchObject({
      ok: false,
    });
  });
});
