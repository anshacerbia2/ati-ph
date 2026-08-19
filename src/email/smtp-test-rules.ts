export type SmtpManualTestDecision =
  | {
      ok: true;
      recipient: string;
    }
  | {
      ok: false;
      reasons: string[];
    };

export function smtpManualTestDecision(input: {
  deliveryMode: "DISABLED" | "STREAM" | "SMTP";
  testEnabled: boolean;
  explicitSendFlag: boolean;
  fromAddress: string | undefined;
  recipient: string | undefined;
}): SmtpManualTestDecision {
  const reasons: string[] = [];

  if (input.deliveryMode !== "SMTP") {
    reasons.push(
      "EMAIL_DELIVERY_MODE must be SMTP for the manual SMTP test.",
    );
  }

  if (!input.testEnabled) {
    reasons.push(
      "EMAIL_SMTP_TEST_ENABLED must be true.",
    );
  }

  if (!input.explicitSendFlag) {
    reasons.push(
      "The manual SMTP test requires the explicit --send flag.",
    );
  }

  const fromAddress = input.fromAddress?.trim();
  const recipient = input.recipient?.trim();

  if (!fromAddress) {
    reasons.push(
      "EMAIL_FROM_ADDRESS is required.",
    );
  }

  if (!recipient) {
    reasons.push(
      "EMAIL_SMTP_TEST_RECIPIENT is required.",
    );
  }

  if (
    fromAddress &&
    recipient &&
    emailDomain(fromAddress) !==
      emailDomain(recipient)
  ) {
    reasons.push(
      "Manual SMTP test recipient must use the same email domain as EMAIL_FROM_ADDRESS.",
    );
  }

  return reasons.length > 0
    ? { ok: false, reasons }
    : {
        ok: true,
        recipient: recipient as string,
      };
}

function emailDomain(
  email: string,
): string {
  return (
    email
      .trim()
      .toLowerCase()
      .split("@")
      .at(-1) ?? ""
  );
}
