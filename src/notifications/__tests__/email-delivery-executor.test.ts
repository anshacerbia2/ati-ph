import { describe, expect, it } from "vitest";

import {
  EmailDeliveryEngine,
  EmailTransportRegistry,
} from "@/email/engine";
import { StaticEmailRouteResolver } from "@/email/static-routing";
import {
  StreamEmailTransport,
} from "@/email/transports/stream";
import {
  executeStreamNotificationDelivery,
} from "@/notifications/email-delivery-executor";

describe("notification STREAM delivery executor", () => {
  it("runs claim -> composer -> email engine -> completion without network delivery", async () => {
    const routes =
      new StaticEmailRouteResolver({
        identities: [
          {
            code: "PH_NOTIFICATION",
            from: {
              email:
                "apps@atibusinessgroup.com",
            },
          },
        ],
        routes: [
          {
            senderIdentityCode:
              "PH_NOTIFICATION",
            transportCode:
              "SAFE_STREAM",
          },
        ],
      });

    const registry =
      new EmailTransportRegistry();
    registry.register(
      new StreamEmailTransport("SAFE_STREAM"),
    );

    const completions: unknown[] = [];

    const result =
      await executeStreamNotificationDelivery({
        claim: {
          attemptId: "attempt-1",
          jobId: "job-1",
          attemptNumber: 1,
          leaseExpiresAt:
            new Date("2099-01-01T00:00:00Z"),
          idempotencyKey:
            "notification-job-key",
          retryCeiling: 3,
          recipientSnapshot: {
            to: [
              {
                email:
                  "runtime@dummy.test",
                displayName: "Runtime",
              },
            ],
            cc: [],
          },
          ruleSnapshot: {
            holidayName:
              "Example Holiday",
            calendarRegion: {
              code: "AU",
              displayName: "Australia",
            },
            targetHolidayDate:
              "2026-12-25",
          },
        },
        emailEngine:
          new EmailDeliveryEngine(
            routes,
            registry,
          ),
        senderIdentityCode:
          "PH_NOTIFICATION",
        transportCode: "SAFE_STREAM",
        complete: async (completion) => {
          completions.push(completion);
        },
      });

    expect(result.status).toBe("SENT");
    expect(completions).toHaveLength(1);
    expect(completions[0]).toMatchObject({
      attemptId: "attempt-1",
      outcome: {
        status: "SENT",
        provider: "SAFE_STREAM",
      },
    });
  });
});
