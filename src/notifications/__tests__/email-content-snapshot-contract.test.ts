import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

const schema = fs.readFileSync(
  path.join(root, "prisma/schema.prisma"),
  "utf8",
);

const migration = fs.readFileSync(
  path.join(
    root,
    "prisma/migrations/20260819211500_notification_email_content_snapshot/migration.sql",
  ),
  "utf8",
);

const jobs = fs.readFileSync(
  path.join(
    root,
    "src/notifications/jobs.ts",
  ),
  "utf8",
);

const approvalRules = fs.readFileSync(
  path.join(
    root,
    "src/notifications/approval-rules.ts",
  ),
  "utf8",
);

const composer = fs.readFileSync(
  path.join(
    root,
    "src/notifications/email-composer.ts",
  ),
  "utf8",
);

describe("governed notification email content snapshot contract", () => {
  it("persists rendered content and checksum on durable jobs", () => {
    expect(schema).toContain(
      "contentSnapshot",
    );
    expect(schema).toContain(
      "contentSha256",
    );
    expect(migration).toContain(
      '"contentSnapshot" JSONB',
    );
    expect(migration).toContain(
      '"contentSha256" CHAR(64)',
    );
    expect(jobs).toContain(
      "renderGovernedNotificationContent",
    );
    expect(jobs).toContain(
      "computeNotificationContentSha256",
    );
  });

  it("includes frozen email content in the maker-checker approval hash", () => {
    expect(approvalRules).toContain(
      "contentSnapshot",
    );
    expect(approvalRules).toContain(
      "contentSha256",
    );
  });

  it("delivers from the frozen content rather than rerendering a mutable template", () => {
    expect(composer).toContain(
      "parseNotificationContentSnapshot",
    );
    expect(composer).toContain(
      "computeNotificationContentSha256",
    );
    expect(composer).not.toContain(
      "renderGovernedNotificationContent",
    );
  });
});
