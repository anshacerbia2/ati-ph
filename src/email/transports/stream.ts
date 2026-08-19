import * as nodemailer from "nodemailer";

import type {
  EmailTransport,
  ResolvedEmailMessage,
} from "@/email/contracts";

export class StreamEmailTransport implements EmailTransport {
  private readonly transporter = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "unix",
    disableFileAccess: true,
    disableUrlAccess: true,
  });

  constructor(public readonly code: string) {}

  async send(message: ResolvedEmailMessage) {
    const info = await this.transporter.sendMail(toMailerMessage(message));

    if (!Buffer.isBuffer(info.message)) {
      throw new Error("Stream transport did not produce a buffered email.");
    }

    return {
      transportCode: this.code,
      providerMessageId:
        typeof info.messageId === "string" ? info.messageId : message.messageId,
      accepted: allRecipients(message),
      rejected: [],
    };
  }
}

export function toMailerMessage(message: ResolvedEmailMessage) {
  return {
    from: address(message.senderIdentity.from),
    replyTo: message.senderIdentity.replyTo
      ? address(message.senderIdentity.replyTo)
      : undefined,
    to: message.to.map(address),
    cc: message.cc?.map(address),
    bcc: message.bcc?.map(address),
    subject: message.subject,
    text: message.text,
    html: message.html,
    headers: {
      ...message.headers,
      "X-ATI-Idempotency-Key": message.idempotencyKey,
    },
    messageId: message.messageId,
    attachments: message.attachments?.map((item) => ({
      filename: item.filename,
      content: item.content,
      contentType: item.contentType ?? undefined,
    })),
  };
}

function address(value: { email: string; name?: string | null }) {
  return { address: value.email, name: value.name ?? "" };
}

function allRecipients(message: ResolvedEmailMessage): string[] {
  return [
    ...message.to,
    ...(message.cc ?? []),
    ...(message.bcc ?? []),
  ].map((item) => item.email);
}
