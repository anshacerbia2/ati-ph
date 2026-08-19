import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_RETRY_MAX_SECONDS,
  notificationDeliveryRetryDecision,
} from "@/notifications/delivery-rules";

describe("notification delivery retry policy", () => {
  const now =
    new Date("2026-08-19T13:30:00.000Z");

  it("treats retryCeiling as retries after the initial attempt", () => {
    const decision =
      notificationDeliveryRetryDecision({
        failureClass: "RETRYABLE",
        attemptNumber: 1,
        retryCeiling: 3,
        now,
      });

    expect(decision).toMatchObject({
      action: "RETRY",
      retryNumber: 1,
      delaySeconds: 60,
      remainingRetries: 2,
      retryCeiling: 3,
    });

    if (decision.action === "RETRY") {
      expect(decision.retryAt.toISOString()).toBe(
        "2026-08-19T13:31:00.000Z",
      );
    }
  });

  it("stops after the configured retry ceiling", () => {
    expect(
      notificationDeliveryRetryDecision({
        failureClass: "RETRYABLE",
        attemptNumber: 4,
        retryCeiling: 3,
        now,
      }),
    ).toEqual({
      action: "FAIL",
      reason:
        "RETRY_CEILING_EXHAUSTED",
      retriesUsed: 3,
      retryCeiling: 3,
    });
  });

  it("defaults a missing retry ceiling to zero retries", () => {
    expect(
      notificationDeliveryRetryDecision({
        failureClass: "RETRYABLE",
        attemptNumber: 1,
        retryCeiling: null,
        now,
      }),
    ).toEqual({
      action: "FAIL",
      reason:
        "RETRY_CEILING_EXHAUSTED",
      retriesUsed: 0,
      retryCeiling: 0,
    });
  });

  it("never retries terminal failures", () => {
    expect(
      notificationDeliveryRetryDecision({
        failureClass: "TERMINAL",
        attemptNumber: 1,
        retryCeiling: 20,
        now,
      }),
    ).toMatchObject({
      action: "FAIL",
      reason: "TERMINAL_FAILURE",
    });
  });

  it("never auto-retries unknown delivery outcomes", () => {
    expect(
      notificationDeliveryRetryDecision({
        failureClass:
          "OUTCOME_UNKNOWN",
        attemptNumber: 1,
        retryCeiling: 20,
        now,
      }),
    ).toMatchObject({
      action: "FAIL",
      reason:
        "DELIVERY_OUTCOME_UNKNOWN",
    });
  });

  it("caps exponential retry backoff", () => {
    const decision =
      notificationDeliveryRetryDecision({
        failureClass: "RETRYABLE",
        attemptNumber: 20,
        retryCeiling: 20,
        now,
      });

    expect(decision).toMatchObject({
      action: "RETRY",
      delaySeconds:
        NOTIFICATION_RETRY_MAX_SECONDS,
    });
  });
});
