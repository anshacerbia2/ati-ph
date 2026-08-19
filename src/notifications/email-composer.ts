import { z } from "zod";

import type { EmailMessage } from "@/email/contracts";
import type { NotificationDeliveryClaim } from "@/notifications/delivery";
import {
  computeNotificationContentSha256,
  parseNotificationContentSnapshot,
} from "@/notifications/email-template";

const recipientSchema = z.object({
  email: z.email(),
  displayName: z.string().nullable().optional(),
}).passthrough();

const recipientSnapshotSchema = z.object({
  to: z.array(recipientSchema).min(1),
  cc: z.array(recipientSchema).default([]),
});

export class NotificationEmailComposerError extends Error {
  constructor(message: string) {
    super(message);
    this.name =
      "NotificationEmailComposerError";
  }
}

/**
 * STREAM execution now renders the exact governed client-facing
 * content frozen at NotificationJob commit time.
 *
 * STREAM still has no network delivery. External SMTP execution
 * remains gated separately in the worker.
 */
export function composeStreamNotificationEmail(input: {
  claim: NotificationDeliveryClaim;
  senderIdentityCode: string;
}): EmailMessage {
  const recipients =
    recipientSnapshotSchema.safeParse(
      input.claim.recipientSnapshot,
    );

  if (!recipients.success) {
    throw new NotificationEmailComposerError(
      `Recipient snapshot is invalid: ${recipients.error.issues
        .map((issue) => issue.message)
        .join(", ")}`,
    );
  }

  if (
    !input.claim.contentSnapshot ||
    !input.claim.contentSha256
  ) {
    throw new NotificationEmailComposerError(
      "Notification job has no frozen governed email content snapshot.",
    );
  }

  let content;

  try {
    content =
      parseNotificationContentSnapshot(
        input.claim.contentSnapshot,
      );
  } catch (error) {
    throw new NotificationEmailComposerError(
      `Email content snapshot is invalid: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );
  }

  const computedSha =
    computeNotificationContentSha256(
      content,
    );

  if (
    computedSha !==
    input.claim.contentSha256
  ) {
    throw new NotificationEmailComposerError(
      "Frozen email content checksum does not match its snapshot.",
    );
  }

  return {
    senderIdentityCode:
      input.senderIdentityCode,
    idempotencyKey:
      input.claim.idempotencyKey,
    to: recipients.data.to.map(
      (recipient) => ({
        email: recipient.email,
        name:
          recipient.displayName ?? null,
      }),
    ),
    cc: recipients.data.cc.map(
      (recipient) => ({
        email: recipient.email,
        name:
          recipient.displayName ?? null,
      }),
    ),
    subject: content.subject,
    html: content.html,
    headers: {
      "X-ATI-Notification-Job":
        input.claim.jobId,
      "X-ATI-Delivery-Attempt":
        String(
          input.claim.attemptNumber,
        ),
      "X-ATI-Email-Template":
        content.templateCode,
      "X-ATI-Email-Template-Version":
        String(
          content.templateVersion,
        ),
      "X-ATI-Content-SHA256":
        input.claim.contentSha256,
      "X-ATI-Content-Mode":
        "GOVERNED_TEMPLATE_STREAM_PREVIEW",
    },
  };
}
