import { describe, expect, it } from "vitest";

import {
  EmailDeliveryEngine,
  EmailTransportRegistry,
} from "@/email/engine";
import { StaticEmailRouteResolver } from "@/email/static-routing";
import { StreamEmailTransport } from "@/email/transports/stream";

describe("stream email transport", () => {
  it("generates RFC 822 safely without network delivery", async () => {
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
          transportCode: "DEV_STREAM",
        },
      ],
    });

    const registry = new EmailTransportRegistry();
    registry.register(new StreamEmailTransport("DEV_STREAM"));

    const result = await new EmailDeliveryEngine(routes, registry).send({
      senderIdentityCode: "PH_NOTIFICATION",
      idempotencyKey: "safe-stream-test",
      to: [{ email: "receiver@dummy.test" }],
      cc: [{ email: "audit@dummy.test" }],
      subject: "ATI safe stream test",
      text: "No external delivery.",
      attachments: [
        {
          filename: "safe.txt",
          content: Buffer.from("safe"),
          contentType: "text/plain",
        },
      ],
    });

    expect(result.transportCode).toBe("DEV_STREAM");
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toEqual([
      "receiver@dummy.test",
      "audit@dummy.test",
    ]);
  });
});
