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
import {
  computeNotificationContentSha256,
  renderGovernedNotificationContent,
} from "@/notifications/email-template";

describe("notification STREAM delivery executor", () => {
  function buildEngine() {
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
      new StreamEmailTransport(
        "SAFE_STREAM",
      ),
    );

    return new EmailDeliveryEngine(
      routes,
      registry,
    );
  }

  function content() {
    const snapshot =
      renderGovernedNotificationContent({
        clientName: "Client Alpha",
        holidayName:
          "Example Holiday",
        targetHolidayDate:
          "2026-12-25",
      });

    return {
      snapshot,
      sha:
        computeNotificationContentSha256(
          snapshot,
        ),
    };
  }

  it("runs frozen governed content -> email engine -> completion without network delivery", async () => {
    const completions: unknown[] = [];
    const frozen = content();

    const result =
      await executeStreamNotificationDelivery({
        claim: {
          attemptId: "attempt-1",
          jobId: "job-1",
          attemptNumber: 1,
          leaseExpiresAt:
            new Date(
              "2099-01-01T00:00:00Z",
            ),
          idempotencyKey:
            "notification-job-key",
          retryCeiling: 3,
          recipientSnapshot: {
            to: [
              {
                email:
                  "runtime@dummy.test",
                displayName:
                  "Runtime",
              },
            ],
            cc: [],
          },
          ruleSnapshot: {},
          contentSnapshot:
            frozen.snapshot,
          contentSha256:
            frozen.sha,
        },
        emailEngine: buildEngine(),
        senderIdentityCode:
          "PH_NOTIFICATION",
        transportCode:
          "SAFE_STREAM",
        complete: async (
          completion,
        ) => {
          completions.push(
            completion,
          );
          return {
            status: "SENT" as const,
            retryAt: null,
          };
        },
      });

    expect(result.status).toBe("SENT");
    expect(completions).toHaveLength(
      1,
    );
    expect(completions[0]).toMatchObject(
      {
        attemptId: "attempt-1",
        outcome: {
          status: "SENT",
          provider: "SAFE_STREAM",
        },
      },
    );
  });

  it("classifies missing governed content as terminal", async () => {
    const completions: unknown[] = [];

    const result =
      await executeStreamNotificationDelivery({
        claim: {
          attemptId: "attempt-2",
          jobId: "job-2",
          attemptNumber: 1,
          leaseExpiresAt:
            new Date(
              "2099-01-01T00:00:00Z",
            ),
          idempotencyKey:
            "invalid-job-key",
          retryCeiling: 3,
          recipientSnapshot: {
            to: [
              {
                email:
                  "runtime@dummy.test",
              },
            ],
            cc: [],
          },
          ruleSnapshot: {},
          contentSnapshot: null,
          contentSha256: null,
        },
        emailEngine: buildEngine(),
        senderIdentityCode:
          "PH_NOTIFICATION",
        transportCode:
          "SAFE_STREAM",
        complete: async (
          completion,
        ) => {
          completions.push(
            completion,
          );
          return {
            status: "FAILED" as const,
            retryAt: null,
          };
        },
      });

    expect(result.status).toBe(
      "FAILED",
    );
    expect(completions[0]).toMatchObject(
      {
        outcome: {
          status: "FAILED",
          failureClass: "TERMINAL",
          errorCode:
            "STREAM_COMPOSITION_FAILED",
        },
      },
    );
  });
});
