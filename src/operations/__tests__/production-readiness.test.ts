import {
  describe,
  expect,
  it,
} from "vitest";

import {
  evaluateProductionReadiness,
} from "@/operations/production-readiness";
import {
  evaluateWorkerReadiness,
} from "@/operations/readiness";

const productionBase = {
  NODE_ENV: "production",
  PUBLIC_APP_URL:
    "https://one.atibusinessgroup.com/apps/ph-notification/app",
  OIDC_CALLBACK_URL:
    "https://one.atibusinessgroup.com/apps/ph-notification/app/api/auth/callback/keycloak",
  TRUST_ATI_ONE_PROXY: "true",
  KEYCLOAK_CLIENT_SECRET:
    "12345678901234567890123456789012",
  SESSION_SECRET:
    "abcdefghijklmnopqrstuvwxyz123456",
  ATI_ONE_PROXY_SECRET:
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456",
  EMAIL_SMTP_TEST_ENABLED: "false",
  EMAIL_SMTP_PILOT_ENABLED: "false",
  EMAIL_DELIVERY_MODE: "DISABLED",
} as const;

describe("production readiness", () => {
  it("accepts a hardened production application config while external delivery stays closed", () => {
    const report =
      evaluateProductionReadiness(
        productionBase,
      );

    expect(
      report.applicationReady,
    ).toBe(true);
    expect(
      report.externalDeliveryReady,
    ).toBe(true);
  });

  it("blocks placeholder secrets and non-HTTPS production URLs", () => {
    const report =
      evaluateProductionReadiness({
        ...productionBase,
        PUBLIC_APP_URL:
          "http://one.atibusinessgroup.com/apps/ph-notification/app",
        SESSION_SECRET:
          "replace-with-at-least-32-random-characters",
      });

    expect(
      report.applicationReady,
    ).toBe(false);
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "PUBLIC_APP_URL",
        ),
        expect.stringContaining(
          "SESSION_SECRET",
        ),
      ]),
    );
  });

  it("requires explicit production release approval only when automatic SMTP is requested", () => {
    const blocked =
      evaluateProductionReadiness({
        ...productionBase,
        EMAIL_DELIVERY_MODE: "SMTP",
        EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED:
          "true",
        EMAIL_DELIVERY_KILL_SWITCH:
          "false",
        EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED:
          "false",
      });

    expect(
      blocked.applicationReady,
    ).toBe(true);
    expect(
      blocked.externalDeliveryReady,
    ).toBe(false);

    const approved =
      evaluateProductionReadiness({
        ...productionBase,
        EMAIL_DELIVERY_MODE: "SMTP",
        EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED:
          "true",
        EMAIL_DELIVERY_KILL_SWITCH:
          "false",
        EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED:
          "true",
      });

    expect(
      approved.externalDeliveryReady,
    ).toBe(true);
  });
});

describe("worker readiness", () => {
  it("does not require a heartbeat while trusted automation is disabled", () => {
    expect(
      evaluateWorkerReadiness({
        trustedAutomationEnabled:
          false,
        now: new Date(
          "2026-08-20T12:00:00.000Z",
        ),
        pollIntervalMs: 60_000,
        lastSuccessfulAt: null,
      }),
    ).toMatchObject({
      required: false,
      ready: true,
    });
  });

  it("requires a fresh heartbeat when trusted automation is enabled", () => {
    const now = new Date(
      "2026-08-20T12:00:00.000Z",
    );

    expect(
      evaluateWorkerReadiness({
        trustedAutomationEnabled:
          true,
        now,
        pollIntervalMs: 60_000,
        lastSuccessfulAt: new Date(
          "2026-08-20T11:58:00.000Z",
        ),
      }),
    ).toMatchObject({
      required: true,
      ready: true,
      stale: false,
    });

    expect(
      evaluateWorkerReadiness({
        trustedAutomationEnabled:
          true,
        now,
        pollIntervalMs: 60_000,
        lastSuccessfulAt: new Date(
          "2026-08-20T11:50:00.000Z",
        ),
      }),
    ).toMatchObject({
      required: true,
      ready: false,
      stale: true,
    });
  });
});
