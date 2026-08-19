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
    "prisma/migrations/20260819160000_notification_job_scheduler_foundation/migration.sql",
  ),
  "utf8",
);
const worker = fs.readFileSync(
  path.join(root, "src/worker/main.ts"),
  "utf8",
);
const scheduler = fs.readFileSync(
  path.join(root, "src/notifications/scheduler.ts"),
  "utf8",
);
const planningPage = fs.readFileSync(
  path.join(
    root,
    "src/app/(app)/notification-planning/page.tsx",
  ),
  "utf8",
);
const planningUi = fs.readFileSync(
  path.join(
    root,
    "src/components/ph-dashboard/NotificationPlanning.tsx",
  ),
  "utf8",
);
const globalCss = fs.readFileSync(
  path.join(root, "src/app/globals.css"),
  "utf8",
);

describe("notification job scheduler foundation", () => {
  it("persists immutable execution snapshots with explicit status", () => {
    expect(schema).toContain("model NotificationJob");
    expect(schema).toContain("enum NotificationJobStatus");
    expect(schema).toContain("recipientSnapshot");
    expect(schema).toContain("ruleSnapshot");
    expect(schema).toContain("scheduledAt");
    expect(migration).toContain(
      "notification_jobs_idempotency_key_key",
    );
  });

  it("uses SKIP LOCKED for horizontally safe due promotion", () => {
    expect(scheduler).toContain("FOR UPDATE SKIP LOCKED");
    expect(scheduler).toContain(
      "'PLANNED'::\"notification\".\"NotificationJobStatus\"",
    );
    expect(scheduler).toContain(
      "'DUE'::\"notification\".\"NotificationJobStatus\"",
    );
  });

  it("keeps scheduler and delivery as separate boundaries", () => {
    expect(worker).toContain(
      "notification due scheduler; no email delivery",
    );
    expect(worker).not.toContain("smtp");
    expect(worker).not.toContain("sendMail");
    expect(planningPage).toContain(
      "no provider or email sender is wired yet",
    );
  });

  it("refreshes committed planning state without a manual browser refresh", () => {
    expect(planningUi).toContain(
      "const refreshedOccurrences = await load(search, page);",
    );
    expect(planningUi).toContain("apply(refreshedOccurrences);");
    expect(planningUi).toContain("await openPreview(occurrenceId);");
  });

  it("renders committed occurrence badges with semantic success styling", () => {
    expect(globalCss).toContain(
      ".notification-occurrence-regions .notification-occurrence-committed",
    );
    expect(globalCss).toContain("var(--ati-success)");
  });
});
