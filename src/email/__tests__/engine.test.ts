import { describe, expect, it } from "vitest";

import type {
  EmailTransport,
  ResolvedEmailMessage,
} from "@/email/contracts";
import {
  EmailDeliveryEngine,
  EmailTransportRegistry,
} from "@/email/engine";
import { StaticEmailRouteResolver } from "@/email/static-routing";

class CaptureTransport implements EmailTransport {
  messages: ResolvedEmailMessage[] = [];
  constructor(readonly code: string) {}

  async send(message: ResolvedEmailMessage) {
    this.messages.push(message);
    return {
      transportCode: this.code,
      providerMessageId: "provider-1",
      accepted: message.to.map((item) => item.email),
      rejected: [],
    };
  }
}

describe("email delivery engine", () => {
  it("keeps sender identity separate from transport", async () => {
    const routes = new StaticEmailRouteResolver({
      identities: [
        {
          code: "PH_NOTIFICATION",
          from: { email: "apps@atibusinessgroup.com" },
        },
      ],
      routes: [
        {
          senderIdentityCode: "PH_NOTIFICATION",
          transportCode: "ATI_PRIMARY",
        },
      ],
    });

    const transport = new CaptureTransport("ATI_PRIMARY");
    const registry = new EmailTransportRegistry();
    registry.register(transport);

    const engine = new EmailDeliveryEngine(routes, registry);
    await engine.send({
      senderIdentityCode: "PH_NOTIFICATION",
      idempotencyKey: "job-123",
      to: [{ email: "client@dummy.test" }],
      subject: "Test",
      text: "Safe",
    });

    expect(transport.messages[0]?.senderIdentity.from.email).toBe(
      "apps@atibusinessgroup.com",
    );
    expect(transport.messages[0]?.messageId).toContain(
      "@atibusinessgroup.com>",
    );
  });

  it("does not contain implicit fallback behavior", () => {
    const source = EmailDeliveryEngine.prototype.send.toString();
    expect(source).not.toContain("Promise.any");
    expect(source.toLowerCase()).not.toContain("fallback");
  });
});
