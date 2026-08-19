import type {
  EmailDeliveryEngine,
} from "@/email/engine";
import type {
  NotificationDeliveryClaim,
} from "@/notifications/delivery";
import {
  composeStreamNotificationEmail,
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
        errorCode?: string | null;
        errorMessage: string;
      };
};

export async function executeStreamNotificationDelivery(
  input: {
    claim: NotificationDeliveryClaim;
    emailEngine: EmailDeliveryEngine;
    senderIdentityCode: string;
    transportCode: string;
    complete: (
      input: DeliveryCompletionInput,
    ) => Promise<unknown>;
  },
): Promise<
  | {
      status: "SENT";
      attemptId: string;
      jobId: string;
      providerMessageId: string | null;
    }
  | {
      status: "FAILED";
      attemptId: string;
      jobId: string;
      errorMessage: string;
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

    await input.complete({
      attemptId: input.claim.attemptId,
      outcome: {
        status: "FAILED",
        provider: input.transportCode,
        errorCode:
          "STREAM_DELIVERY_EXECUTION_FAILED",
        errorMessage,
      },
    });

    return {
      status: "FAILED",
      attemptId: input.claim.attemptId,
      jobId: input.claim.jobId,
      errorMessage,
    };
  }
}
