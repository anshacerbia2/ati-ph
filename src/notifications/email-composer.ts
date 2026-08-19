import { z } from "zod";

import type { EmailMessage } from "@/email/contracts";
import type { NotificationDeliveryClaim } from "@/notifications/delivery";

const recipientSchema = z.object({
  email: z.email(),
  displayName: z.string().nullable().optional(),
}).passthrough();

const recipientSnapshotSchema = z.object({
  to: z.array(recipientSchema).min(1),
  cc: z.array(recipientSchema).default([]),
});

const regionSchema = z.object({
  code: z.string().min(1),
  displayName: z.string().min(1),
}).passthrough();

const ruleSnapshotSchema = z.object({
  holidayName: z.string().min(1),
  calendarRegion: regionSchema,
  targetHolidayDate: z.string().min(1),
}).passthrough();

export class NotificationEmailComposerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationEmailComposerError";
  }
}

/**
 * Safe technical composer used only by STREAM execution.
 *
 * This is deliberately not the final client-facing PH email template.
 * It proves the frozen-snapshot -> email-message boundary without
 * authorizing external delivery or inventing business copy.
 */
export function composeStreamNotificationEmail(input: {
  claim: NotificationDeliveryClaim;
  senderIdentityCode: string;
}): EmailMessage {
  const recipients = recipientSnapshotSchema.safeParse(
    input.claim.recipientSnapshot,
  );
  const rules = ruleSnapshotSchema.safeParse(
    input.claim.ruleSnapshot,
  );

  if (!recipients.success) {
    throw new NotificationEmailComposerError(
      `Recipient snapshot is invalid: ${recipients.error.issues
        .map((issue) => issue.message)
        .join(", ")}`,
    );
  }

  if (!rules.success) {
    throw new NotificationEmailComposerError(
      `Rule snapshot is invalid: ${rules.error.issues
        .map((issue) => issue.message)
        .join(", ")}`,
    );
  }

  const region = rules.data.calendarRegion;

  return {
    senderIdentityCode: input.senderIdentityCode,
    idempotencyKey: input.claim.idempotencyKey,
    to: recipients.data.to.map((recipient) => ({
      email: recipient.email,
      name: recipient.displayName ?? null,
    })),
    cc: recipients.data.cc.map((recipient) => ({
      email: recipient.email,
      name: recipient.displayName ?? null,
    })),
    subject:
      `[STREAM TEST] Public holiday notification - ${rules.data.holidayName}`,
    text: [
      "ATI PH notification delivery technical preview",
      "",
      `Holiday: ${rules.data.holidayName}`,
      `Region: ${region.displayName} (${region.code})`,
      `Holiday date: ${rules.data.targetHolidayDate}`,
      `Notification job: ${input.claim.jobId}`,
      `Delivery attempt: ${input.claim.attemptNumber}`,
      "",
      "This message was composed for STREAM validation only.",
      "It is not the approved production client-facing email template.",
    ].join("\n"),
    headers: {
      "X-ATI-Notification-Job": input.claim.jobId,
      "X-ATI-Delivery-Attempt":
        String(input.claim.attemptNumber),
      "X-ATI-Content-Mode": "STREAM_TECHNICAL_PREVIEW",
    },
  };
}
