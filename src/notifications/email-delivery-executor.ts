import type {
  EmailDeliveryEngine,
} from "@/email/engine";
import {
  classifyEmailTransportOutcome,
} from "@/email/transport-outcome";
import type {
  NotificationDeliveryClaim,
} from "@/notifications/delivery";
import type {
  NotificationDeliveryFailureClass,
} from "@/notifications/delivery-rules";
import {
  composeStreamNotificationEmail,
} from "@/notifications/email-composer";

type DeliveryCompletionInput = {
  attemptId: string;
  outcome:
    | {
        status: "SENT";
        provider: string;
        providerMessageId?:
          string | null;
        acceptedRecipients?:
          string[];
        rejectedRecipients?:
          string[];
      }
    | {
        status: "FAILED";
        provider: string;
        failureClass:
          NotificationDeliveryFailureClass;
        errorCode?: string | null;
        errorMessage: string;
        acceptedRecipients?:
          string[];
        rejectedRecipients?:
          string[];
      };
};

type DeliveryCompletionResult = {
  status:
    | "SENT"
    | "RETRY_WAIT"
    | "FAILED";
  retryAt?: Date | null;
};

type ExecutorInput = {
  claim: NotificationDeliveryClaim;
  emailEngine: EmailDeliveryEngine;
  senderIdentityCode: string;
  transportCode: string;
  complete: (
    input:
      DeliveryCompletionInput,
  ) => Promise<
    DeliveryCompletionResult
  >;
};

type ExecutorResult =
  | {
      status: "SENT";
      attemptId: string;
      jobId: string;
      providerMessageId:
        string | null;
    }
  | {
      status:
        | "RETRY_WAIT"
        | "FAILED";
      attemptId: string;
      jobId: string;
      errorMessage: string;
      retryAt: Date | null;
    };

export async function executeStreamNotificationDelivery(
  input: ExecutorInput,
): Promise<ExecutorResult> {
  return executeNotificationDelivery(
    input,
    {
      contentMode:
        "GOVERNED_TEMPLATE_STREAM_PREVIEW",
      externalSideEffect: false,
      compositionErrorCode:
        "STREAM_COMPOSITION_FAILED",
      transportErrorCode:
        "STREAM_DELIVERY_EXECUTION_FAILED",
    },
  );
}

/**
 * SMTP execution semantics are implemented and tested,
 * but intentionally not wired into src/worker/main.ts.
 */
export async function executeSmtpNotificationDelivery(
  input: ExecutorInput,
): Promise<ExecutorResult> {
  return executeNotificationDelivery(
    input,
    {
      contentMode:
        "GOVERNED_TEMPLATE_SMTP_DELIVERY",
      externalSideEffect: true,
      compositionErrorCode:
        "SMTP_COMPOSITION_FAILED",
      transportErrorCode:
        "SMTP_DELIVERY_OUTCOME_UNKNOWN",
    },
  );
}

async function executeNotificationDelivery(
  input: ExecutorInput,
  mode: {
    contentMode: string;
    externalSideEffect: boolean;
    compositionErrorCode: string;
    transportErrorCode: string;
  },
): Promise<ExecutorResult> {
  let message;

  try {
    message =
      composeStreamNotificationEmail({
        claim: input.claim,
        senderIdentityCode:
          input.senderIdentityCode,
      });
  } catch (error) {
    return completeFailure(
      input,
      {
        provider:
          input.transportCode,
        failureClass:
          "TERMINAL",
        errorCode:
          mode.compositionErrorCode,
        errorMessage:
          error instanceof Error
            ? error.message
            : String(error),
        acceptedRecipients: [],
        rejectedRecipients: [],
      },
    );
  }

  message.headers = {
    ...message.headers,
    "X-ATI-Content-Mode":
      mode.contentMode,
  };

  let transportResult;

  try {
    transportResult =
      await input.emailEngine.send(
        message,
      );
  } catch (error) {
    const rawMessage =
      error instanceof Error
        ? error.message
        : String(error);

    return completeFailure(
      input,
      {
        provider:
          input.transportCode,
        failureClass:
          mode.externalSideEffect
            ? "OUTCOME_UNKNOWN"
            : "RETRYABLE",
        errorCode:
          mode.transportErrorCode,
        errorMessage:
          mode.externalSideEffect
            ? `Transport outcome is unknown after an external SMTP send attempt: ${rawMessage}`
            : rawMessage,
        acceptedRecipients: [],
        rejectedRecipients: [],
      },
    );
  }

  const outcome =
    classifyEmailTransportOutcome(
      message,
      transportResult,
    );

  if (
    outcome.kind ===
    "FULL_ACCEPTANCE"
  ) {
    const completion =
      await input.complete({
        attemptId:
          input.claim.attemptId,
        outcome: {
          status: "SENT",
          provider:
            transportResult
              .transportCode,
          providerMessageId:
            transportResult
              .providerMessageId,
          acceptedRecipients:
            outcome
              .acceptedRecipients,
          rejectedRecipients:
            outcome
              .rejectedRecipients,
        },
      });

    if (
      completion.status !== "SENT"
    ) {
      throw new Error(
        "Successful delivery completion did not return SENT.",
      );
    }

    return {
      status: "SENT",
      attemptId:
        input.claim.attemptId,
      jobId: input.claim.jobId,
      providerMessageId:
        transportResult
          .providerMessageId,
    };
  }

  return completeFailure(
    input,
    {
      provider:
        transportResult
          .transportCode,
      failureClass:
        outcome.failureClass,
      errorCode:
        outcome.errorCode,
      errorMessage:
        outcome.errorMessage,
      acceptedRecipients:
        outcome
          .acceptedRecipients,
      rejectedRecipients:
        outcome
          .rejectedRecipients,
    },
  );
}

async function completeFailure(
  input: ExecutorInput,
  failure: {
    provider: string;
    failureClass:
      NotificationDeliveryFailureClass;
    errorCode: string;
    errorMessage: string;
    acceptedRecipients:
      string[];
    rejectedRecipients:
      string[];
  },
): Promise<ExecutorResult> {
  const completion =
    await input.complete({
      attemptId:
        input.claim.attemptId,
      outcome: {
        status: "FAILED",
        provider:
          failure.provider,
        failureClass:
          failure.failureClass,
        errorCode:
          failure.errorCode,
        errorMessage:
          failure.errorMessage,
        acceptedRecipients:
          failure
            .acceptedRecipients,
        rejectedRecipients:
          failure
            .rejectedRecipients,
      },
    });

  if (
    completion.status === "SENT"
  ) {
    throw new Error(
      "Failed delivery completion unexpectedly returned SENT.",
    );
  }

  return {
    status: completion.status,
    attemptId:
      input.claim.attemptId,
    jobId: input.claim.jobId,
    errorMessage:
      failure.errorMessage,
    retryAt:
      completion.retryAt ?? null,
  };
}
