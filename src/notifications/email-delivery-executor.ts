import type {
  EmailDeliveryEngine,
} from "@/email/engine";
import type {
  NotificationDeliveryClaim,
} from "@/notifications/delivery";
import type {
  NotificationDeliveryFailureClass,
} from "@/notifications/delivery-rules";
import {
  composeStreamNotificationEmail,
  NotificationEmailComposerError,
} from "@/notifications/email-composer";

type DeliveryCompletionInput = {
  attemptId: string;
  outcome:
    | {
        status: "SENT";
        provider: string;
        providerMessageId?: string | null;
      }
    | {
        status: "FAILED";
        provider: string;
        failureClass:
          NotificationDeliveryFailureClass;
        errorCode?: string | null;
        errorMessage: string;
      };
};

type DeliveryCompletionResult = {
  status: "SENT" | "RETRY_WAIT" | "FAILED";
  retryAt?: Date | null;
};

export async function executeStreamNotificationDelivery(
  input: {
    claim: NotificationDeliveryClaim;
    emailEngine: EmailDeliveryEngine;
    senderIdentityCode: string;
    transportCode: string;
    complete: (
      input: DeliveryCompletionInput,
    ) => Promise<DeliveryCompletionResult>;
  },
): Promise<
  | {
      status: "SENT";
      attemptId: string;
      jobId: string;
      providerMessageId: string | null;
    }
  | {
      status: "RETRY_WAIT" | "FAILED";
      attemptId: string;
      jobId: string;
      errorMessage: string;
      retryAt: Date | null;
    }
> {
  try {
    const message =
      composeStreamNotificationEmail({
        claim: input.claim,
        senderIdentityCode:
          input.senderIdentityCode,
      });

    const result =
      await input.emailEngine.send(message);

    await input.complete({
      attemptId: input.claim.attemptId,
      outcome: {
        status: "SENT",
        provider: result.transportCode,
        providerMessageId:
          result.providerMessageId,
      },
    });

    return {
      status: "SENT",
      attemptId: input.claim.attemptId,
      jobId: input.claim.jobId,
      providerMessageId:
        result.providerMessageId,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error);

    const failureClass:
      NotificationDeliveryFailureClass =
      error instanceof
      NotificationEmailComposerError
        ? "TERMINAL"
        : "RETRYABLE";

    const completion =
      await input.complete({
        attemptId: input.claim.attemptId,
        outcome: {
          status: "FAILED",
          provider: input.transportCode,
          failureClass,
          errorCode:
            failureClass === "TERMINAL"
              ? "STREAM_COMPOSITION_FAILED"
              : "STREAM_DELIVERY_EXECUTION_FAILED",
          errorMessage,
        },
      });

    if (completion.status === "SENT") {
      throw new Error(
        "Failed delivery completion unexpectedly returned SENT.",
      );
    }

    return {
      status: completion.status,
      attemptId: input.claim.attemptId,
      jobId: input.claim.jobId,
      errorMessage,
      retryAt: completion.retryAt ?? null,
    };
  }
}
