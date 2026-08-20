import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  EmailTransport,
  EmailTransportResult,
  ResolvedEmailMessage,
} from "@/email/contracts";
import {
  EmailDeliveryEngine,
  EmailTransportRegistry,
} from "@/email/engine";
import {
  StaticEmailRouteResolver,
} from "@/email/static-routing";
import {
  executeSmtpNotificationDelivery,
} from "@/notifications/email-delivery-executor";
import {
  computeNotificationContentSha256,
  renderGovernedNotificationContent,
} from "@/notifications/email-template";

type ExecutorInput =
  Parameters<
    typeof executeSmtpNotificationDelivery
  >[0];

type CompletionInput =
  Parameters<
    ExecutorInput["complete"]
  >[0];

class FakeTransport
  implements EmailTransport
{
  readonly code = "FAKE_SMTP";

  constructor(
    private readonly behavior:
      | EmailTransportResult
      | Error,
  ) {}

  async send(
    message: ResolvedEmailMessage,
  ): Promise<EmailTransportResult> {
    void message;

    if (
      this.behavior instanceof Error
    ) {
      throw this.behavior;
    }

    return this.behavior;
  }
}

function buildEngine(
  behavior:
    | EmailTransportResult
    | Error,
) {
  const routes =
    new StaticEmailRouteResolver({
      identities: [
        {
          code: "PH_NOTIFICATION",
          from: {
            email:
              "apps@dummy.test",
          },
        },
      ],
      routes: [
        {
          senderIdentityCode:
            "PH_NOTIFICATION",
          transportCode:
            "FAKE_SMTP",
        },
      ],
    });

  const registry =
    new EmailTransportRegistry();

  registry.register(
    new FakeTransport(behavior),
  );

  return new EmailDeliveryEngine(
    routes,
    registry,
  );
}

function buildClaim() {
  const content =
    renderGovernedNotificationContent({
      clientName:
        "Client Alpha",
      holidayName:
        "Example Holiday",
      targetHolidayDate:
        "2027-03-15",
    });

  return {
    attemptId:
      "attempt-smtp-1",
    jobId: "job-smtp-1",
    attemptNumber: 1,
    leaseExpiresAt:
      new Date(
        "2099-01-01T00:00:00Z",
      ),
    idempotencyKey:
      "smtp-outcome-test",
    retryCeiling: 3,
    recipientSnapshot: {
      to: [
        {
          email:
            "one@dummy.test",
        },
        {
          email:
            "two@dummy.test",
        },
      ],
      cc: [],
    },
    ruleSnapshot: {},
    contentSnapshot: content,
    contentSha256:
      computeNotificationContentSha256(
        content,
      ),
  };
}

describe(
  "SMTP notification delivery executor safety",
  () => {
    it(
      "completes SENT only for full acceptance",
      async () => {
        const completions:
          CompletionInput[] = [];

        const result =
          await executeSmtpNotificationDelivery({
            claim:
              buildClaim(),
            emailEngine:
              buildEngine({
                transportCode:
                  "FAKE_SMTP",
                providerMessageId:
                  "provider-1",
                accepted: [
                  "one@dummy.test",
                  "two@dummy.test",
                ],
                rejected: [],
              }),
            senderIdentityCode:
              "PH_NOTIFICATION",
            transportCode:
              "FAKE_SMTP",
            complete: async (
              completion,
            ) => {
              completions.push(
                completion,
              );

              return {
                status:
                  "SENT" as const,
                retryAt: null,
              };
            },
          });

        expect(
          result.status,
        ).toBe("SENT");

        expect(
          completions[0],
        ).toMatchObject({
          outcome: {
            status: "SENT",
            acceptedRecipients: [
              "one@dummy.test",
              "two@dummy.test",
            ],
            rejectedRecipients: [],
          },
        });
      },
    );

    it(
      "treats complete rejection as retryable and delegates bounded retry to durable completion",
      async () => {
        const completions:
          CompletionInput[] = [];

        const result =
          await executeSmtpNotificationDelivery({
            claim:
              buildClaim(),
            emailEngine:
              buildEngine({
                transportCode:
                  "FAKE_SMTP",
                providerMessageId:
                  null,
                accepted: [],
                rejected: [
                  "one@dummy.test",
                  "two@dummy.test",
                ],
              }),
            senderIdentityCode:
              "PH_NOTIFICATION",
            transportCode:
              "FAKE_SMTP",
            complete: async (
              completion,
            ) => {
              completions.push(
                completion,
              );

              return {
                status:
                  "RETRY_WAIT" as const,
                retryAt:
                  new Date(
                    "2027-01-01T00:01:00Z",
                  ),
              };
            },
          });

        expect(
          result.status,
        ).toBe(
          "RETRY_WAIT",
        );

        expect(
          completions[0],
        ).toMatchObject({
          outcome: {
            status: "FAILED",
            failureClass:
              "RETRYABLE",
            errorCode:
              "DELIVERY_ALL_RECIPIENTS_REJECTED",
            acceptedRecipients: [],
            rejectedRecipients: [
              "one@dummy.test",
              "two@dummy.test",
            ],
          },
        });
      },
    );

    it(
      "blocks retry after partial acceptance",
      async () => {
        const completions:
          CompletionInput[] = [];

        const result =
          await executeSmtpNotificationDelivery({
            claim:
              buildClaim(),
            emailEngine:
              buildEngine({
                transportCode:
                  "FAKE_SMTP",
                providerMessageId:
                  "provider-2",
                accepted: [
                  "one@dummy.test",
                ],
                rejected: [
                  "two@dummy.test",
                ],
              }),
            senderIdentityCode:
              "PH_NOTIFICATION",
            transportCode:
              "FAKE_SMTP",
            complete: async (
              completion,
            ) => {
              completions.push(
                completion,
              );

              return {
                status:
                  "FAILED" as const,
                retryAt: null,
              };
            },
          });

        expect(
          result.status,
        ).toBe(
          "FAILED",
        );

        expect(
          completions[0],
        ).toMatchObject({
          outcome: {
            failureClass:
              "OUTCOME_UNKNOWN",
            errorCode:
              "DELIVERY_PARTIAL_ACCEPTANCE",
          },
        });
      },
    );

    it(
      "treats a thrown SMTP send error as outcome unknown",
      async () => {
        const completions:
          CompletionInput[] = [];

        await executeSmtpNotificationDelivery({
          claim:
            buildClaim(),
          emailEngine:
            buildEngine(
              new Error(
                "connection dropped",
              ),
            ),
          senderIdentityCode:
            "PH_NOTIFICATION",
          transportCode:
            "FAKE_SMTP",
          complete: async (
            completion,
          ) => {
            completions.push(
              completion,
            );

            return {
              status:
                "FAILED" as const,
              retryAt: null,
            };
          },
        });

        expect(
          completions[0],
        ).toMatchObject({
          outcome: {
            failureClass:
              "OUTCOME_UNKNOWN",
            errorCode:
              "SMTP_DELIVERY_OUTCOME_UNKNOWN",
          },
        });
      },
    );

    it(
      "does not reinterpret completion persistence failure as an SMTP transport failure",
      async () => {
        let completionCalls = 0;

        await expect(
          executeSmtpNotificationDelivery({
            claim:
              buildClaim(),
            emailEngine:
              buildEngine({
                transportCode:
                  "FAKE_SMTP",
                providerMessageId:
                  "provider-3",
                accepted: [
                  "one@dummy.test",
                  "two@dummy.test",
                ],
                rejected: [],
              }),
            senderIdentityCode:
              "PH_NOTIFICATION",
            transportCode:
              "FAKE_SMTP",
            complete: async () => {
              completionCalls += 1;

              throw new Error(
                "database unavailable",
              );
            },
          }),
        ).rejects.toThrow(
          "database unavailable",
        );

        expect(
          completionCalls,
        ).toBe(1);
      },
    );
  },
);
