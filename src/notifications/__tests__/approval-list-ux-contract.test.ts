import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

const planning = fs.readFileSync(
  path.join(
    root,
    "src/components/ph-dashboard/NotificationPlanning.tsx",
  ),
  "utf8",
);

const planningServer = fs.readFileSync(
  path.join(root, "src/notifications/planning.ts"),
  "utf8",
);

describe("notification approval list UX", () => {
  it("surfaces committed approval lifecycle state in the occurrence list", () => {
    expect(planningServer).toContain(
      "approvalState: notificationApprovalListState",
    );
    expect(planning).toContain(
      "approvalListLabel(",
    );
    expect(planning).toContain(
      "Approval pending",
    );
    expect(planning).toContain(
      "Approved",
    );
    expect(planning).toContain(
      "Rejected",
    );
  });

  it("refetches the occurrence list after approval request and decision", () => {
    const refetches = planning.match(
      /const refreshedOccurrences = await load\(\s*search,\s*page,\s*\);/g,
    );

    expect(refetches?.length).toBeGreaterThanOrEqual(2);
    expect(planning).toContain(
      'setApprovalNotice("Approval requested.")',
    );
    expect(planning).toContain(
      "Approval accepted. Waiting jobs are now PLANNED.",
    );
  });
});
