export type EmailAddress = { email: string; name?: string | null };

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string | null;
};

export type EmailMessage = {
  senderIdentityCode: string;
  idempotencyKey: string;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  attachments?: EmailAttachment[];
};

export type EmailSenderIdentity = {
  code: string;
  from: EmailAddress;
  replyTo?: EmailAddress | null;
};

export type ResolvedEmailMessage = EmailMessage & {
  senderIdentity: EmailSenderIdentity;
  messageId: string;
};

export type EmailTransportResult = {
  transportCode: string;
  providerMessageId: string | null;
  accepted: string[];
  rejected: string[];
};

export interface EmailTransport {
  readonly code: string;
  send(message: ResolvedEmailMessage): Promise<EmailTransportResult>;
}

export interface EmailRouteResolver {
  resolve(senderIdentityCode: string): Promise<{
    senderIdentity: EmailSenderIdentity;
    transportCode: string;
  }>;
}
