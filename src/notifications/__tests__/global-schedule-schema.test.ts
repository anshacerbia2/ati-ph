import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const schema = fs.readFileSync(
  path.join(process.cwd(), "prisma/schema.prisma"),
  "utf8",
);
const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260819143000_global_notification_schedule/migration.sql",
  ),
  "utf8",
);
const policyUi = fs.readFileSync(
  path.join(
    process.cwd(),
    "src/components/ph-dashboard/NotificationPolicyAdmin.tsx",
  ),
  "utf8",
);

describe("global notification schedule architecture", () => {
  it("has one versioned global default and explicit client override source", () => {
    expect(schema).toContain("model NotificationSchedulePolicy");
    expect(schema).toContain("model NotificationSchedulePolicyVersion");
    expect(schema).toContain("enum NotificationScheduleSource");
    expect(schema).toContain(
      "scheduleSource         NotificationScheduleSource",
    );
    expect(migration).toContain(
      "notification_schedule_policy_versions_one_active_idx",
    );
  });

  it("presents global default and client override as separate concepts", () => {
    expect(policyUi).toContain("Global notification schedule");
    expect(policyUi).toContain("Use global default");
    expect(policyUi).toContain("Client override");
    expect(policyUi).toContain("Override schedule");
    expect(policyUi).toContain("Edit override");
    expect(policyUi).toContain("globalSchedule.currentVersion");
    expect(policyUi).toContain(
      'setLeadTimeValue(global?.leadTimeValue?.toString() ?? "")',
    );
    expect(policyUi).toContain(
      'setApprovalMode(global?.approvalMode ?? "UNCONFIRMED")',
    );
    expect(policyUi).toContain('setScheduleSource("CLIENT_OVERRIDE")');
    expect(policyUi.replace(/\s+/g, " ")).toContain(
      "Only use Client override when the client has a confirmed exception.",
    );
  });
});
