import { createHash } from "node:crypto";

import type {
  EmailMessage,
  EmailRouteResolver,
  EmailTransport,
  EmailTransportResult,
} from "@/email/contracts";

export class EmailDeliveryEngineError extends Error {
  constructor(
    public readonly code:
      | "EMAIL_MESSAGE_INVALID"
      | "EMAIL_TRANSPORT_NOT_REGISTERED",
    message: string,
  ) {
    super(message);
    this.name = "EmailDeliveryEngineError";
  }
}

export class EmailTransportRegistry {
  private readonly transports = new Map<string, EmailTransport>();

  register(transport: EmailTransport): void {
    const code = normalizeCode(transport.code);
    if (this.transports.has(code)) {
      throw new Error(`Email transport ${code} is already registered.`);
    }
    this.transports.set(code, transport);
  }

  get(code: string): EmailTransport {
    const normalized = normalizeCode(code);
    const transport = this.transports.get(normalized);
    if (!transport) {
      throw new EmailDeliveryEngineError(
        "EMAIL_TRANSPORT_NOT_REGISTERED",
        `Email transport ${normalized} is not registered.`,
      );
    }
    return transport;
  }
}

export class EmailDeliveryEngine {
  constructor(
    private readonly routes: EmailRouteResolver,
    private readonly transports: EmailTransportRegistry,
  ) {}

  async send(message: EmailMessage): Promise<EmailTransportResult> {
    validateMessage(message);

    const route = await this.routes.resolve(message.senderIdentityCode);
    const transport = this.transports.get(route.transportCode);

    const domain =
      route.senderIdentity.from.email.split("@").at(-1)?.toLowerCase() ??
      "email.invalid";
    const digest = createHash("sha256")
      .update(message.idempotencyKey)
      .digest("hex");

    return transport.send({
      ...message,
      senderIdentity: route.senderIdentity,
      messageId: `<ati-${digest}@${domain}>`,
    });
  }
}

function validateMessage(message: EmailMessage): void {
  if (!message.senderIdentityCode.trim()) invalid("senderIdentityCode is required.");
  if (!message.idempotencyKey.trim()) invalid("idempotencyKey is required.");
  if (message.to.length < 1) invalid("At least one TO recipient is required.");
  if (!message.subject.trim()) invalid("Email subject is required.");
  if (!message.text?.trim() && !message.html?.trim()) {
    invalid("Email text or HTML body is required.");
  }
}

function invalid(message: string): never {
  throw new EmailDeliveryEngineError("EMAIL_MESSAGE_INVALID", message);
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}
