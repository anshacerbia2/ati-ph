import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

const migration = fs.readFileSync(
  path.join(
    root,
    "prisma/migrations/20260819190000_notification_approval_delivery_contract/migration.sql",
  ),
  "utf8",
);

const worker = fs.readFileSync(
  path.join(root, "src/worker/main.ts"),
  "utf8",
);

const approvalRoute = fs.readFileSync(
  path.join(
    root,
    "src/app/api/notification-planning/approval/[occurrenceId]/route.ts",
  ),
  "utf8",
);

const delivery = fs.readFileSync(
  path.join(root, "src/notifications/delivery.ts"),
  "utf8",
);

describe("notification approval and delivery contract", () => {
  it("persists delivery claim/attempt state without introducing SMTP", () => {
    expect(migration).toContain("'PROCESSING'");
    expect(migration).toContain("'SENT'");
    expect(migration).toContain("'FAILED'");
    expect(migration).toContain(
      "notification_delivery_attempts",
    );
    expect(delivery).toContain("FOR UPDATE SKIP LOCKED");
    expect(delivery.toLowerCase()).not.toContain("smtp");
    expect(delivery).not.toContain("sendMail");
  });

  it("keeps the delivery claim contract dormant until a provider slice wires it", () => {
    expect(worker).not.toContain(
      "claimDueNotificationJobs",
    );
    expect(worker).toContain("no email delivery");
  });

  it("uses a dedicated maker-checker permission for notification approval", () => {
    expect(approvalRoute).toContain(
      "PERMISSIONS.NOTIFICATION_PLAN_APPROVE",
    );
    expect(approvalRoute).toContain(
      "decideNotificationPlanApproval",
    );
  });
});
