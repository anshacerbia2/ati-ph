import { describe, expect, it } from "vitest";

import {
  composeStreamNotificationEmail,
  NotificationEmailComposerError,
} from "@/notifications/email-composer";

describe("notification STREAM email composer", () => {
  it("composes only from the frozen job snapshots", () => {
    const message =
      composeStreamNotificationEmail({
        senderIdentityCode:
          "PH_NOTIFICATION",
        claim: {
          attemptId: "attempt-1",
          jobId: "job-1",
          attemptNumber: 1,
          leaseExpiresAt:
            new Date("2026-08-20T00:00:00Z"),
          idempotencyKey: "job-idempotency",
          retryCeiling: 3,
          recipientSnapshot: {
            to: [
              {
                contactId: "contact-1",
                displayName: "Client Ops",
                email: "client@dummy.test",
              },
            ],
            cc: [
              {
                contactId: "contact-2",
                displayName: null,
                email: "audit@dummy.test",
              },
            ],
          },
          ruleSnapshot: {
            holidayName:
              "Example Holiday Alpha",
            calendarRegion: {
              id: "region-1",
              code: "AU",
              displayName: "Australia",
            },
            targetHolidayDate:
              "2026-12-25",
          },
        },
      });

    expect(message.to).toEqual([
      {
        email: "client@dummy.test",
        name: "Client Ops",
      },
    ]);
    expect(message.cc).toEqual([
      {
        email: "audit@dummy.test",
        name: null,
      },
    ]);
    expect(message.subject).toContain(
      "Example Holiday Alpha",
    );
    expect(message.text).toContain(
      "STREAM validation only",
    );
    expect(
      message.headers?.[
        "X-ATI-Content-Mode"
      ],
    ).toBe("STREAM_TECHNICAL_PREVIEW");
  });

  it("fails closed when a frozen snapshot is incomplete", () => {
    expect(() =>
      composeStreamNotificationEmail({
        senderIdentityCode:
          "PH_NOTIFICATION",
        claim: {
          attemptId: "attempt-1",
          jobId: "job-1",
          attemptNumber: 1,
          leaseExpiresAt: new Date(),
          idempotencyKey: "job-idempotency",
          retryCeiling: null,
          recipientSnapshot: {
            to: [],
            cc: [],
          },
          ruleSnapshot: {},
        },
      }),
    ).toThrow(NotificationEmailComposerError);
  });
});
