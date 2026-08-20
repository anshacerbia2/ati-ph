import {
  readFileSync,
} from "node:fs";
import {
  describe,
  expect,
  it,
} from "vitest";

describe("delivery reconciliation persistence contract", () => {
  const source = readFileSync(
    "src/notifications/delivery-reconciliation.ts",
    "utf8",
  );
  const schema = readFileSync(
    "prisma/schema.prisma",
    "utf8",
  );

  it("persists immutable reconciliation evidence and actor", () => {
    expect(schema).toContain(
      "reconciliationAction NotificationDeliveryReconciliationAction?",
    );
    expect(schema).toContain("reconciledById");
    expect(schema).toContain("reconciliationNote");
    expect(source).toContain("NOTIFICATION_DELIVERY_RECONCILED");
    expect(source).toContain("notification.delivery.reconciled");
  });

  it("locks the attempt and only reconciles unknown outcomes", () => {
    expect(source).toContain("FOR UPDATE");
    expect(source).toContain(
      "notificationDeliveryReconciliationEligibility",
    );
    expect(source).toContain("OUTCOME_UNKNOWN");
  });
});
