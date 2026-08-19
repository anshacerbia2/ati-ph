import * as nodemailer from "nodemailer";

import type {
  EmailTransport,
  ResolvedEmailMessage,
} from "@/email/contracts";
import { toMailerMessage } from "@/email/transports/stream";

export type SmtpEmailTransportConfig = {
  code: string;
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  username?: string | null;
  password?: string | null;
  connectionTimeoutMs: number;
};

export class SmtpEmailTransport implements EmailTransport {
  private readonly transporter: nodemailer.Transporter;
  readonly code: string;

  constructor(config: SmtpEmailTransportConfig) {
    this.code = config.code;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: config.requireTls,
      auth:
        config.username && config.password
          ? { user: config.username, pass: config.password }
          : undefined,
      connectionTimeout: config.connectionTimeoutMs,
      greetingTimeout: config.connectionTimeoutMs,
      socketTimeout: Math.max(config.connectionTimeoutMs * 3, 30_000),
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }

  async send(message: ResolvedEmailMessage) {
    const info = await this.transporter.sendMail(toMailerMessage(message));

    return {
      transportCode: this.code,
      providerMessageId:
        typeof info.messageId === "string" ? info.messageId : message.messageId,
      accepted: normalize(info.accepted),
      rejected: normalize(info.rejected),
    };
  }
}

function normalize(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map((value) =>
        typeof value === "string" ? value : JSON.stringify(value),
      )
    : [];
}
