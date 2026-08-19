import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

const worker = fs.readFileSync(
  path.join(
    root,
    "src/worker/main.ts",
  ),
  "utf8",
);

const script = fs.readFileSync(
  path.join(
    root,
    "scripts/email-smtp-test.ts",
  ),
  "utf8",
);

const packageJson = JSON.parse(
  fs.readFileSync(
    path.join(root, "package.json"),
    "utf8",
  ),
) as {
  scripts?: Record<string, string>;
};

describe("manual SMTP test contract", () => {
  it("keeps production SMTP NotificationJob execution gated", () => {
    expect(worker).toContain(
      'emailDelivery?.mode === "STREAM"',
    );
    expect(worker).toContain(
      "SMTP transport configured, but notification external delivery remains gated",
    );
    expect(worker).not.toContain(
      'emailDelivery?.mode === "SMTP" &&',
    );
  });

  it("requires an explicit manual send command", () => {
    expect(
      packageJson.scripts?.[
        "email:smtp:test"
      ],
    ).toContain(
      "scripts/email-smtp-test.ts",
    );
    expect(script).toContain(
      'process.argv.includes("--send")',
    );
    expect(script).toContain(
      "EMAIL_SMTP_TEST_ENABLED",
    );
    expect(script).toContain(
      "EMAIL_SMTP_TEST_RECIPIENT",
    );
  });

  it("does not touch application database or notification jobs", () => {
    expect(script).not.toContain(
      "@/lib/db",
    );
    expect(script).not.toContain(
      "PrismaClient",
    );
    expect(script).not.toContain(
      "claimDueNotificationJobs",
    );
    expect(script).not.toContain(
      "@/notifications/",
    );
    expect(script).not.toContain(
      "notificationJob.",
    );
    expect(script).not.toContain(
      "notificationJob(",
    );
  });
});
