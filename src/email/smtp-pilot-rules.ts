export type SmtpPilotGateInput = {
  mode: "DISABLED" | "STREAM" | "SMTP";
  enabled: boolean;
  fromAddress?: string | null;
  recipient?: string | null;
};

export type SmtpPilotGateResult =
  | {
      ok: true;
      fromAddress: string;
      recipient: string;
      domain: string;
    }
  | {
      ok: false;
      reason: string;
    };

export function evaluateSmtpPilotGate(
  input: SmtpPilotGateInput,
): SmtpPilotGateResult {
  if (input.mode !== "SMTP") {
    return {
      ok: false,
      reason:
        "EMAIL_DELIVERY_MODE must be SMTP for the notification SMTP pilot.",
    };
  }

  if (!input.enabled) {
    return {
      ok: false,
      reason:
        "EMAIL_SMTP_PILOT_ENABLED must be true for the notification SMTP pilot.",
    };
  }

  const fromAddress = input.fromAddress?.trim().toLowerCase();
  const recipient = input.recipient?.trim().toLowerCase();

  if (!fromAddress) {
    return {
      ok: false,
      reason: "EMAIL_FROM_ADDRESS is required for the notification SMTP pilot.",
    };
  }

  if (!recipient) {
    return {
      ok: false,
      reason:
        "EMAIL_SMTP_PILOT_RECIPIENT is required for the notification SMTP pilot.",
    };
  }

  const fromDomain = emailDomain(fromAddress);
  const recipientDomain = emailDomain(recipient);

  if (!fromDomain || !recipientDomain) {
    return {
      ok: false,
      reason: "Pilot sender and recipient must be valid email addresses.",
    };
  }

  if (fromDomain !== recipientDomain) {
    return {
      ok: false,
      reason:
        "Notification SMTP pilot recipient must use the same domain as EMAIL_FROM_ADDRESS.",
    };
  }

  return {
    ok: true,
    fromAddress,
    recipient,
    domain: fromDomain,
  };
}

function emailDomain(value: string): string | null {
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  return value.slice(at + 1);
}
