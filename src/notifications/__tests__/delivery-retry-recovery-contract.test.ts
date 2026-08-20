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
    "prisma/migrations/20260819202000_notification_delivery_retry_recovery/migration.sql",
  ),
  "utf8",
);

const delivery = fs.readFileSync(
  path.join(
    root,
    "src/notifications/delivery.ts",
  ),
  "utf8",
);

const worker = fs.readFileSync(
  path.join(root, "src/worker/main.ts"),
  "utf8",
);

describe("notification delivery retry and lease recovery contract", () => {
  it("persists retry wait and failure classification", () => {
    expect(schema).toContain(
      "RETRY_WAIT",
    );
    expect(schema).toContain(
      "NotificationDeliveryFailureClass",
    );
    expect(schema).toContain(
      "retryAt",
    );
    expect(schema).toContain(
      "leaseRetrySafe",
    );

    expect(migration).toContain(
      "'RETRY_WAIT'",
    );
    expect(migration).toContain(
      "notification_jobs_status_retry_at_idx",
    );
  });

  it("recovers expired claims with row locking", () => {
    expect(delivery).toContain(
      "recoverExpiredNotificationDeliveryClaims",
    );
    expect(delivery).toContain(
      "FOR UPDATE OF attempt SKIP LOCKED",
    );
    expect(delivery).toContain(
      "DELIVERY_OUTCOME_UNKNOWN_AFTER_LEASE",
    );
    expect(delivery).toContain(
      "Automatic retry is blocked to avoid duplicate delivery",
    );
  });

  it("promotes only due retries back into claimable DUE state", () => {
    expect(delivery).toContain(
      "promoteRetryableNotificationJobs",
    );
    expect(delivery).toContain(
      "'RETRY_WAIT'::\"notification\".\"NotificationJobStatus\"",
    );
    expect(delivery).toContain(
      'job."retryAt" <=',
    );
  });

  it("marks STREAM claims retry-safe and SMTP claims non-retry-safe behind release control", () => {
    expect(worker).toContain(
      "leaseRetrySafe: true",
    );
    expect(worker).toContain(
      "leaseRetrySafe: false",
    );
    expect(worker).toContain(
      "recoverExpiredNotificationDeliveryClaims",
    );
    expect(worker).toContain(
      "promoteRetryableNotificationJobs",
    );
    expect(worker).toContain(
      "resolveEmailAutomaticDeliveryRelease",
    );
    expect(worker).toContain(
      "canExecuteSmtpAutomatically",
    );
  });
});
