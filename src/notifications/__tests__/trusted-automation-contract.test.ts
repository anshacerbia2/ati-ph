import {
  readFileSync,
} from "node:fs";
import {
  describe,
  expect,
  it,
} from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("trusted automation contract", () => {
  const schema = read(
    "prisma/schema.prisma",
  );
  const migration = read(
    "prisma/migrations/20260820183000_notification_trusted_automation/migration.sql",
  );
  const worker = read(
    "src/worker/main.ts",
  );
  const automation = read(
    "src/notifications/automation.ts",
  );
  const publication = read(
    "src/app/api/imports/[batchId]/publish/route.ts",
  );
  const planning = read(
    "src/notifications/plan-engine.ts",
  );
  const reconciliation = read(
    "src/notifications/delivery-reconciliation-rules.ts",
  );

  it("persists operational alerts and worker heartbeat", () => {
    expect(schema).toContain(
      "model NotificationOperationalAlert",
    );
    expect(schema).toContain(
      "model NotificationWorkerState",
    );
    expect(migration).toContain(
      "notification_operational_alerts",
    );
    expect(migration).toContain(
      "notification_worker_state",
    );
  });

  it("keeps trusted planning automation independently gated", () => {
    expect(worker).toContain(
      "NOTIFICATION_TRUSTED_AUTOMATION_ENABLED",
    );
    expect(worker).toContain(
      "runScheduledNotificationPlanning",
    );
    expect(automation).toContain(
      "commitEnabled",
    );
    expect(automation).toContain(
      'source: "AUTOMATION"',
    );
    expect(automation).toContain(
      "publishedById",
    );
  });

  it("monitors scheduler lag and delivery failure", () => {
    expect(worker).toContain(
      "syncSchedulerLagAlerts",
    );
    expect(worker).toContain(
      "syncDeliveryFailureAlerts",
    );
    expect(worker).toContain(
      "markNotificationWorkerCycleCompleted",
    );
  });

  it("supports governed retention without deleting business history", () => {
    expect(worker).toContain(
      "runNotificationOperationalRetention",
    );
    const retention = read(
      "src/notifications/retention.ts",
    );
    expect(retention).toContain(
      "notificationOperationalAlert.deleteMany",
    );
    expect(retention).not.toContain(
      "notificationJob.delete",
    );
    expect(retention).not.toContain(
      "auditEvent.delete",
    );
  });

  it("locks and cancels unsent jobs before publishing a correction", () => {
    expect(publication).toContain(
      "lockRevisionNotificationJobs",
    );
    expect(publication).toContain(
      "FOR UPDATE",
    );
    expect(read("src/holiday/revision.ts")).toContain(
      '"PROCESSING"',
    );
    expect(publication).toContain(
      '"CANCELLED"',
    );
  });

  it("forces corrected notification plans through approval", () => {
    expect(planning).toContain(
      "applyCorrectionApprovalOverride",
    );
    expect(reconciliation).toContain(
      "occurrenceSuperseded",
    );
    expect(reconciliation).toContain(
      "Retry is blocked",
    );
  });

  it("exposes a read-only operations dashboard API", () => {
    const route = read(
      "src/app/api/notification-operations/route.ts",
    );
    const component = read(
      "src/components/ph-dashboard/TrustedAutomationOperations.tsx",
    );
    expect(route).toContain(
      "getNotificationOperationsOverview",
    );
    expect(component).toContain(
      "/api/notification-operations",
    );
  });
});
