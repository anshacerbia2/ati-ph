import { describe, expect, it } from "vitest";

import {
  composeStreamNotificationEmail,
  NotificationEmailComposerError,
} from "@/notifications/email-composer";
import {
  computeNotificationContentSha256,
  renderGovernedNotificationContent,
} from "@/notifications/email-template";

function frozenContent() {
  const content =
    renderGovernedNotificationContent({
      clientName: "Client Alpha",
      holidayName:
        "Example Holiday Alpha",
      targetHolidayDate:
        "2026-12-25",
    });

  return {
    content,
    contentSha256:
      computeNotificationContentSha256(
        content,
      ),
  };
}

describe("notification STREAM email composer", () => {
  it("uses exact governed content frozen on the job", () => {
    const frozen = frozenContent();

    const message =
      composeStreamNotificationEmail({
        senderIdentityCode:
          "PH_NOTIFICATION",
        claim: {
          attemptId: "attempt-1",
          jobId: "job-1",
          attemptNumber: 1,
          leaseExpiresAt:
            new Date(
              "2026-08-20T00:00:00Z",
            ),
          idempotencyKey:
            "job-idempotency",
          retryCeiling: 3,
          recipientSnapshot: {
            to: [
              {
                contactId:
                  "contact-1",
                displayName:
                  "Client Ops",
                email:
                  "client@dummy.test",
              },
            ],
            cc: [
              {
                contactId:
                  "contact-2",
                displayName: null,
                email:
                  "audit@dummy.test",
              },
            ],
          },
          ruleSnapshot: {},
          contentSnapshot:
            frozen.content,
          contentSha256:
            frozen.contentSha256,
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
    expect(message.subject).toBe(
      "ATI - Client Alpha Public Holiday Reminder - Example Holiday Alpha - 25 December 2026",
    );
    expect(message.html).toContain(
      "Hi Client Alpha Leaders,",
    );
    expect(message.attachments).toBe(
      undefined,
    );
    expect(
      message.headers?.[
        "X-ATI-Content-Mode"
      ],
    ).toBe(
      "GOVERNED_TEMPLATE_STREAM_PREVIEW",
    );
  });

  it("fails closed for legacy jobs without frozen content", () => {
    expect(() =>
      composeStreamNotificationEmail({
        senderIdentityCode:
          "PH_NOTIFICATION",
        claim: {
          attemptId: "attempt-1",
          jobId: "job-1",
          attemptNumber: 1,
          leaseExpiresAt:
            new Date(),
          idempotencyKey:
            "job-idempotency",
          retryCeiling: null,
          recipientSnapshot: {
            to: [
              {
                email:
                  "client@dummy.test",
              },
            ],
            cc: [],
          },
          ruleSnapshot: {},
          contentSnapshot: null,
          contentSha256: null,
        },
      }),
    ).toThrow(
      NotificationEmailComposerError,
    );
  });

  it("fails closed when the frozen content checksum is altered", () => {
    const frozen = frozenContent();

    expect(() =>
      composeStreamNotificationEmail({
        senderIdentityCode:
          "PH_NOTIFICATION",
        claim: {
          attemptId: "attempt-1",
          jobId: "job-1",
          attemptNumber: 1,
          leaseExpiresAt:
            new Date(),
          idempotencyKey:
            "job-idempotency",
          retryCeiling: null,
          recipientSnapshot: {
            to: [
              {
                email:
                  "client@dummy.test",
              },
            ],
            cc: [],
          },
          ruleSnapshot: {},
          contentSnapshot: {
            ...frozen.content,
            subject: "tampered",
          },
          contentSha256:
            frozen.contentSha256,
        },
      }),
    ).toThrow(
      "checksum does not match",
    );
  });
});
