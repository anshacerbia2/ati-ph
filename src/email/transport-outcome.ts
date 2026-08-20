import type {
  EmailMessage,
  EmailTransportResult,
} from "@/email/contracts";

export type EmailTransportOutcome =
  | {
      kind: "FULL_ACCEPTANCE";
      acceptedRecipients: string[];
      rejectedRecipients: string[];
    }
  | {
      kind: "FULL_REJECTION";
      failureClass: "RETRYABLE";
      errorCode:
        "DELIVERY_ALL_RECIPIENTS_REJECTED";
      errorMessage: string;
      acceptedRecipients: string[];
      rejectedRecipients: string[];
    }
  | {
      kind:
        | "PARTIAL_ACCEPTANCE"
        | "INCOMPLETE_ACCEPTANCE_EVIDENCE";
      failureClass: "OUTCOME_UNKNOWN";
      errorCode:
        | "DELIVERY_PARTIAL_ACCEPTANCE"
        | "DELIVERY_RECIPIENT_OUTCOME_INCOMPLETE";
      errorMessage: string;
      acceptedRecipients: string[];
      rejectedRecipients: string[];
    };

export function classifyEmailTransportOutcome(
  message: EmailMessage,
  result: EmailTransportResult,
): EmailTransportOutcome {
  const requested = unique(
    [
      ...message.to,
      ...(message.cc ?? []),
      ...(message.bcc ?? []),
    ].map((item) =>
      canonical(item.email),
    ),
  );

  if (requested.length === 0) {
    throw new Error(
      "Email transport outcome requires at least one requested recipient.",
    );
  }

  const acceptedRecipients =
    normalizeEvidence(result.accepted);
  const rejectedRecipients =
    normalizeEvidence(result.rejected);

  const requestedSet =
    new Set(requested);
  const acceptedSet =
    new Set(
      acceptedRecipients.map(canonical),
    );
  const rejectedSet =
    new Set(
      rejectedRecipients.map(canonical),
    );

  const acceptedRequested =
    requested.filter((email) =>
      acceptedSet.has(email),
    );
  const rejectedRequested =
    requested.filter((email) =>
      rejectedSet.has(email),
    );
  const conflicting =
    requested.filter(
      (email) =>
        acceptedSet.has(email) &&
        rejectedSet.has(email),
    );
  const missing =
    requested.filter(
      (email) =>
        !acceptedSet.has(email) &&
        !rejectedSet.has(email),
    );
  const unexpectedAccepted =
    acceptedRecipients.filter(
      (value) =>
        !requestedSet.has(
          canonical(value),
        ),
    );
  const unexpectedRejected =
    rejectedRecipients.filter(
      (value) =>
        !requestedSet.has(
          canonical(value),
        ),
    );

  const evidenceIsExact =
    conflicting.length === 0 &&
    missing.length === 0 &&
    unexpectedAccepted.length === 0 &&
    unexpectedRejected.length === 0;

  if (
    evidenceIsExact &&
    acceptedRequested.length ===
      requested.length &&
    rejectedRequested.length === 0
  ) {
    return {
      kind: "FULL_ACCEPTANCE",
      acceptedRecipients,
      rejectedRecipients,
    };
  }

  if (
    evidenceIsExact &&
    rejectedRequested.length ===
      requested.length &&
    acceptedRequested.length === 0
  ) {
    return {
      kind: "FULL_REJECTION",
      failureClass: "RETRYABLE",
      errorCode:
        "DELIVERY_ALL_RECIPIENTS_REJECTED",
      errorMessage:
        "The transport explicitly rejected every requested recipient and accepted none. Retrying is duplicate-safe and remains bounded by the NotificationJob retry ceiling.",
      acceptedRecipients,
      rejectedRecipients,
    };
  }

  if (
    acceptedRequested.length > 0 &&
    rejectedRequested.length > 0
  ) {
    return {
      kind: "PARTIAL_ACCEPTANCE",
      failureClass:
        "OUTCOME_UNKNOWN",
      errorCode:
        "DELIVERY_PARTIAL_ACCEPTANCE",
      errorMessage:
        "The transport accepted some requested recipients and rejected others. Automatic retry is blocked because retrying the complete message could duplicate delivery to already accepted recipients.",
      acceptedRecipients,
      rejectedRecipients,
    };
  }

  return {
    kind:
      "INCOMPLETE_ACCEPTANCE_EVIDENCE",
    failureClass:
      "OUTCOME_UNKNOWN",
    errorCode:
      "DELIVERY_RECIPIENT_OUTCOME_INCOMPLETE",
    errorMessage:
      "The transport recipient evidence does not fully and consistently account for exactly the requested recipients. Automatic retry is blocked pending reconciliation.",
    acceptedRecipients,
    rejectedRecipients,
  };
}

function normalizeEvidence(
  values: readonly string[],
): string[] {
  return unique(
    values
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) =>
        value.length > 1000
          ? value.slice(0, 1000)
          : value,
      ),
  );
}

function canonical(
  value: string,
): string {
  const normalized =
    value.trim().toLowerCase();
  const angleAddress =
    /<([^<>\s]+@[^<>\s]+)>/.exec(
      normalized,
    );

  return (
    angleAddress?.[1] ??
    normalized
  );
}

function unique<T>(
  values: T[],
): T[] {
  return [...new Set(values)];
}
