import { describe, expect, it } from "vitest";

import { serverEnvSchema } from "@/config/server-env";

/**
 * The environment file is the source of truth, so the contradictions it can express
 * are worth a test each.
 *
 * Every combination below *starts* without these rules, and then behaves as though a
 * flag the operator set were not set. That is the configuration bug that costs the
 * most to find: nothing fails, no log line disagrees with either reading, and the only
 * way to learn the truth is to read the code the file was supposed to save you from.
 */

/** The minimum a profile must state. Every test below varies one thing from here. */
const BASE = {
  PUBLIC_APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db?schema=public",
  KEYCLOAK_ISSUER: "https://example.test/auth/realms/ati-one",
  KEYCLOAK_CLIENT_ID: "client",
  KEYCLOAK_CLIENT_SECRET: "secret",
  SESSION_SECRET: "0123456789012345678901234567890123",
  ATI_ONE_RETURN_URL: "http://localhost:3000/",
  EMAIL_FROM_ADDRESS: "apps@atibusinessgroup.com",
  EMAIL_SMTP_HOST: "smtp.example.test",
} as const;

function parse(overrides: Record<string, string>) {
  return serverEnvSchema.safeParse({ ...BASE, ...overrides });
}

/** The issue paths a failed parse reported, so a test asserts *which* rule fired. */
function paths(result: ReturnType<typeof parse>): string[] {
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join("."));
}

describe("environment profile coherence", () => {
  it("accepts the local profile: manual connectivity test, worker off", () => {
    const result = parse({
      EMAIL_DELIVERY_MODE: "SMTP",
      EMAIL_SMTP_TEST_ENABLED: "true",
      EMAIL_SMTP_TEST_RECIPIENT: "someone@atibusinessgroup.com",
      EMAIL_SMTP_PILOT_ENABLED: "false",
      EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED: "false",
      EMAIL_DELIVERY_KILL_SWITCH: "true",
      NOTIFICATION_WORKER_ENABLED: "false",
    });

    expect(result.success).toBe(true);
  });

  it("accepts the test profile: controlled pilot, worker on, nothing delivered", () => {
    const result = parse({
      EMAIL_DELIVERY_MODE: "SMTP",
      EMAIL_SMTP_TEST_ENABLED: "false",
      EMAIL_SMTP_PILOT_ENABLED: "true",
      EMAIL_SMTP_PILOT_RECIPIENT: "someone@atibusinessgroup.com",
      EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED: "false",
      EMAIL_DELIVERY_KILL_SWITCH: "true",
      NOTIFICATION_WORKER_ENABLED: "true",
    });

    expect(result.success).toBe(true);
  });

  it("accepts the production profile: automatic delivery, worker on", () => {
    const result = parse({
      EMAIL_DELIVERY_MODE: "SMTP",
      EMAIL_SMTP_TEST_ENABLED: "false",
      EMAIL_SMTP_PILOT_ENABLED: "false",
      EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED: "true",
      EMAIL_DELIVERY_KILL_SWITCH: "false",
      EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED: "true",
      NOTIFICATION_WORKER_ENABLED: "true",
    });

    expect(result.success).toBe(true);
  });

  it("refuses automatic delivery armed against a non-SMTP transport", () => {
    /*
     * STREAM never opens a connection, so the flag reads as enabled and sends nothing.
     * This was expressible and silent.
     */
    const result = parse({
      EMAIL_DELIVERY_MODE: "STREAM",
      EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED: "true",
      EMAIL_DELIVERY_KILL_SWITCH: "false",
      NOTIFICATION_WORKER_ENABLED: "true",
    });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain(
      "EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED",
    );
  });

  it("refuses the connectivity test and the pilot at the same time", () => {
    const result = parse({
      EMAIL_DELIVERY_MODE: "SMTP",
      EMAIL_SMTP_TEST_ENABLED: "true",
      EMAIL_SMTP_TEST_RECIPIENT: "someone@atibusinessgroup.com",
      EMAIL_SMTP_PILOT_ENABLED: "true",
      EMAIL_SMTP_PILOT_RECIPIENT: "someone@atibusinessgroup.com",
      NOTIFICATION_WORKER_ENABLED: "false",
    });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("EMAIL_SMTP_PILOT_ENABLED");
  });

  it("refuses automatic delivery alongside a manual command", () => {
    /*
     * Both paths send through the same transport as the same sender. With both open,
     * a message in the inbox does not say which one produced it — and that is the
     * evidence a delivery release is argued from.
     */
    const result = parse({
      EMAIL_DELIVERY_MODE: "SMTP",
      EMAIL_SMTP_PILOT_ENABLED: "true",
      EMAIL_SMTP_PILOT_RECIPIENT: "someone@atibusinessgroup.com",
      EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED: "true",
      EMAIL_DELIVERY_KILL_SWITCH: "false",
      NOTIFICATION_WORKER_ENABLED: "true",
    });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain(
      "EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED",
    );
  });

  it("refuses automatic delivery while the worker is disabled", () => {
    /*
     * The worker is the only thing that executes automatic delivery. Armed without it,
     * the profile describes an intent the deployment cannot carry out — and reads, to
     * anyone auditing it, as a deployment that sends.
     */
    const result = parse({
      EMAIL_DELIVERY_MODE: "SMTP",
      EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED: "true",
      EMAIL_DELIVERY_KILL_SWITCH: "false",
      NOTIFICATION_WORKER_ENABLED: "false",
    });

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("NOTIFICATION_WORKER_ENABLED");
  });

  it("defaults every delivery gate to its closed position", () => {
    /*
     * Stated as a test because one of them closes by being `true` and the rest by being
     * `false`, which is exactly the kind of asymmetry a reader assumes away.
     */
    const result = parse({});

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.EMAIL_DELIVERY_MODE).toBe("DISABLED");
    expect(result.data.EMAIL_SMTP_TEST_ENABLED).toBe("false");
    expect(result.data.EMAIL_SMTP_PILOT_ENABLED).toBe("false");
    expect(result.data.EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED).toBe("false");
    expect(result.data.EMAIL_DELIVERY_KILL_SWITCH).toBe("true");
    expect(result.data.NOTIFICATION_WORKER_ENABLED).toBe("false");
    expect(result.data.EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED).toBe("false");
  });

  it("requires ATI_ONE_RETURN_URL rather than defaulting to loopback", () => {
    /*
     * It defaulted to `http://localhost:3000/`. A production process that forgot the
     * variable sent people to a loopback address on their own machine, which reads as a
     * broken link rather than as a missing setting.
     */
    const withoutReturnUrl = Object.fromEntries(
      Object.entries(BASE).filter(
        ([key]) => key !== "ATI_ONE_RETURN_URL",
      ),
    );
    const result = serverEnvSchema.safeParse(withoutReturnUrl);

    expect(result.success).toBe(false);
    expect(paths(result)).toContain("ATI_ONE_RETURN_URL");
  });
});
