import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { serverEnvSchema } from "@/config/server-env";

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(
    path.join(root, rel),
    "utf8",
  );
}

/**
 * The assignments in an example file, as the process would see them.
 *
 * Deliberately not dotenv: this asserts what a reader of the file would conclude, so it
 * reads the file the plain way — first `=` splits, `#` lines and blanks ignored.
 */
function assignments(
  rel: string,
): Record<string, string> {
  const out: Record<string, string> = {};

  for (const line of read(rel).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    out[trimmed.slice(0, separator).trim()] =
      trimmed.slice(separator + 1).trim();
  }

  return out;
}

const PROFILES = [
  ".env.local.example",
  ".env.test.example",
  ".env.production.example",
] as const;

/** The two profiles that may never deliver to a client, whatever else they configure. */
const NON_DELIVERING = [
  ".env.local.example",
  ".env.test.example",
] as const;

describe("email documentation and environment contract", () => {
  it("documents the explicit real SMTP test command and safety gates", () => {
    for (const rel of [
      "README.md",
      "src/email/README.md",
      "docs/LOCAL-EMAIL-TESTING.md",
    ]) {
      const content = read(rel);

      expect(content).toContain(
        "npm run email:smtp:test -- --send",
      );
      expect(content).toContain(
        "EMAIL_SMTP_TEST_ENABLED",
      );
      expect(content).toContain(
        "EMAIL_SMTP_TEST_RECIPIENT",
      );
    }
  });

  /*
   * This replaced a check that every example contained `EMAIL_DELIVERY_MODE=DISABLED`.
   *
   * That was the right intent expressed against the wrong shape. One example served
   * every environment, so it had to ship inert with the real values commented out
   * beside it — and a reader had to decide which lines applied before trusting any of
   * them. There are three complete profiles now, and they differ precisely in what
   * they are allowed to do, so "everything is disabled" is no longer the property
   * worth asserting.
   *
   * What is asserted instead is stronger: each profile parses under the real schema,
   * and the two that must never reach a client cannot be read as though they might.
   */
  it("validates every example profile against the real schema", () => {
    for (const rel of PROFILES) {
      const result = serverEnvSchema.safeParse(
        assignments(rel),
      );

      expect(
        result.success ? [] : result.error.issues.map(
          (issue) => `${issue.path.join(".")}: ${issue.message}`,
        ),
        `${rel} must be a valid, coherent profile`,
      ).toEqual([]);
    }
  });

  it("keeps the local and test profiles incapable of automatic delivery", () => {
    for (const rel of NON_DELIVERING) {
      const env = assignments(rel);

      expect(
        env.EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED,
        `${rel} must not arm automatic delivery`,
      ).toBe("false");
      expect(
        env.EMAIL_DELIVERY_KILL_SWITCH,
        `${rel} must keep the kill switch active`,
      ).toBe("true");
      expect(
        env.EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED,
        `${rel} must not record a production release`,
      ).toBe("false");
    }
  });

  it("keeps the worker disabled in the local profile", () => {
    /*
     * The one profile a developer runs on a database they are editing. A worker there
     * claims jobs, promotes schedules and mutates delivery state without being asked.
     */
    expect(
      assignments(".env.local.example")
        .NOTIFICATION_WORKER_ENABLED,
    ).toBe("false");
  });

  it("requires the production profile to carry its release evidence when armed", () => {
    /*
     * Production is the one profile that may send, so the assertion is coherence rather
     * than absence: if delivery is armed, the approval that records a human decision
     * must be present, both manual commands must be off, and the operational stop must
     * be configured — a running deployment needs a way to halt delivery that is not an
     * edit to this file.
     */
    const env = assignments(".env.production.example");

    if (env.EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED !== "true") return;

    expect(env.EMAIL_DELIVERY_MODE).toBe("SMTP");
    expect(env.EMAIL_DELIVERY_KILL_SWITCH).toBe("false");
    expect(env.EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED).toBe("true");
    expect(env.NOTIFICATION_WORKER_ENABLED).toBe("true");
    expect(env.EMAIL_SMTP_TEST_ENABLED).toBe("false");
    expect(env.EMAIL_SMTP_PILOT_ENABLED).toBe("false");
    expect(env.EMAIL_DELIVERY_KILL_SWITCH_PATH ?? "").not.toBe("");
  });

  it("keeps .env.example an index rather than a fourth profile", () => {
    /*
     * Its whole value is that it holds no values. A variable creeping back in here is
     * how one file starts serving every environment again.
     */
    expect(Object.keys(assignments(".env.example"))).toEqual([]);

    const content = read(".env.example");
    for (const profile of PROFILES) {
      expect(content).toContain(profile);
    }
  });

  it("documents that SMTP job execution is still gated", () => {
    for (const rel of [
      "README.md",
      "src/email/README.md",
      "docs/EMAIL-DELIVERY-PLATFORM.md",
      "docs/LOCAL-EMAIL-TESTING.md",
    ]) {
      expect(read(rel)).toMatch(
        /SMTP[\s\S]{0,200}gate|gate[\s\S]{0,200}SMTP/i,
      );
    }
  });
});
