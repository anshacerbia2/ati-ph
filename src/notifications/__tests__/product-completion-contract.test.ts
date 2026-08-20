import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

function read(path: string): string {
  return readFileSync(
    path,
    "utf8",
  );
}

describe("ATI PH product completion contract", () => {
  const schema = read(
    "prisma/schema.prisma",
  );
  const jobs = read(
    "src/notifications/jobs.ts",
  );
  const delivery = read(
    "src/notifications/delivery.ts",
  );
  const worker = read(
    "src/worker/main.ts",
  );
  const smtpRelease = read(
    "src/email/automatic-delivery-release.ts",
  );

  it("preserves idempotent notification planning and horizontally safe claims", () => {
    expect(schema).toContain(
      "idempotencyKey",
    );
    expect(schema).toContain(
      "@unique",
    );
    expect(jobs).toContain(
      "pg_advisory_xact_lock",
    );
    expect(delivery).toContain(
      "FOR UPDATE SKIP LOCKED",
    );
  });

  it("fails restart recovery closed for non-retry-safe SMTP claims", () => {
    expect(delivery).toContain(
      "DELIVERY_OUTCOME_UNKNOWN_AFTER_LEASE",
    );
    expect(delivery).toMatch(
      /const failureClass:[\s\S]*NotificationDeliveryFailureClass[\s\S]*=[\s\S]*retrySafe[\s\S]*\? "RETRYABLE"[\s\S]*: "OUTCOME_UNKNOWN"/,
    );
    expect(worker).toMatch(
      /mode === "SMTP"[\s\S]*leaseRetrySafe: false/,
    );
  });

  it("keeps automatic SMTP behind kill switch and production release approval", () => {
    expect(smtpRelease).toContain(
      "EMAIL_DELIVERY_KILL_SWITCH",
    );
    expect(smtpRelease).toContain(
      "EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED",
    );
    expect(smtpRelease).toContain(
      "productionReleaseRequired",
    );
  });

  it("exposes liveness, readiness, operations, audit and reconciliation endpoints", () => {
    expect(
      read(
        "src/app/api/health/live/route.ts",
      ),
    ).toContain('status: "UP"');
    expect(
      read(
        "src/app/api/health/ready/route.ts",
      ),
    ).toContain(
      "evaluateWorkerReadiness",
    );
    expect(
      read(
        "src/app/api/notification-operations/route.ts",
      ),
    ).toContain(
      "getNotificationOperationsOverview",
    );
    expect(
      read(
        "src/app/api/notification-operations/audit/route.ts",
      ),
    ).toContain(
      "listNotificationAuditEvents",
    );
    expect(
      read(
        "src/app/api/notification-delivery/reconciliation/route.ts",
      ),
    ).toContain(
      "listNotificationDeliveryReconciliationQueue",
    );
  });

  it("surfaces notification operations on the product overview", () => {
    const overview = read(
      "src/app/(app)/page.tsx",
    );

    expect(overview).toContain(
      "Notifications due",
    );
    expect(overview).toContain(
      "Delivery failed",
    );
    expect(overview).toContain(
      "Open alerts",
    );
    expect(overview).toContain(
      "Unknown outcomes",
    );
  });

  it("documents production and acceptance gates", () => {
    expect(
      read(
        "docs/PRODUCTION-READINESS.md",
      ),
    ).toContain(
      "EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED",
    );
    expect(
      read(
        "docs/PRODUCT-ACCEPTANCE-CHECKLIST.md",
      ),
    ).toContain(
      "Software-complete acceptance",
    );
  });
});
