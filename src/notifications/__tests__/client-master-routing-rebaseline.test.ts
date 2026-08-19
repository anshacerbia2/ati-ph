import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const seedSource = fs.readFileSync(
  path.join(process.cwd(), "prisma/seed.ts"),
  "utf8",
);
const schemaSource = fs.readFileSync(
  path.join(process.cwd(), "prisma/schema.prisma"),
  "utf8",
);
const migrationSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260819140000_notification_client_master_routing_rebaseline/migration.sql",
  ),
  "utf8",
);
const policySource = fs.readFileSync(
  path.join(process.cwd(), "src/notifications/policy.ts"),
  "utf8",
);
const policyUiSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "src/components/ph-dashboard/NotificationPolicyAdmin.tsx",
  ),
  "utf8",
);
const planningUiSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "src/components/ph-dashboard/NotificationPlanning.tsx",
  ),
  "utf8",
);
const cssSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/globals.css"),
  "utf8",
);

describe("Client_Master notification routing rebaseline", () => {
  it("preserves the legacy Tag as evidence instead of bootstrap matching authority", () => {
    expect(schemaSource).toContain("legacyClientMasterTag");
    expect(seedSource).toContain("legacyClientMasterTag: record.dayFilter");
    expect(seedSource).toContain('holidayDayFilter: "ALL"');
    expect(seedSource).not.toContain(
      'holidayDayFilter: record.dayFilter === "Weekdays" ? "WEEKDAY" : "WEEKEND"',
    );
    expect(migrationSource).toContain(
      "'ALL'::\"notification\".\"HolidayDayFilter\"",
    );
    expect(migrationSource).toContain("isActive");
  });

  it("maps Client PIC Email to TO and Client_Master CC to CC on the policy page", () => {
    expect(policySource).toContain("deliveryRouting");
    expect(policySource).toContain('recipient.recipientType === "TO"');
    expect(policySource).toContain('recipient.recipientType === "CC"');
    expect(policyUiSource).toContain("Client PIC Email (TO)");
    expect(policyUiSource).toContain("Client_Master routing");
  });

  it("shows source routing in planning without compatibility-team noise", () => {
    expect(planningUiSource).toContain("Client PIC Email (TO)");
    expect(planningUiSource).toContain("result.calendarRegion.displayName");
    expect(planningUiSource).toContain("evidence only, not matching authority");
  });

  it("ports the modal to body and gives it a shrinkable scroll row", () => {
    expect(planningUiSource).toContain(
      'import { createPortal } from "react-dom";',
    );
    expect(planningUiSource).toContain("document.body");
    expect(cssSource).toContain("grid-template-rows:auto minmax(0,1fr)");
    expect(cssSource).toContain("min-height:0");
    expect(cssSource).toContain("100dvh");
  });
});
