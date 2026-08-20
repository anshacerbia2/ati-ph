import {
  describe,
  expect,
  it,
} from "vitest";

import {
  classifyEmailTransportOutcome,
} from "@/email/transport-outcome";

const message = {
  senderIdentityCode:
    "PH_NOTIFICATION",
  idempotencyKey:
    "outcome-test",
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
  cc: [
    {
      email:
        "three@dummy.test",
    },
  ],
  subject: "Outcome test",
};

describe(
  "email transport recipient outcome",
  () => {
    it(
      "accepts SENT only when evidence exactly accounts for every requested recipient",
      () => {
        expect(
          classifyEmailTransportOutcome(
            message,
            {
              transportCode:
                "TEST_SMTP",
              providerMessageId:
                "message-1",
              accepted: [
                "ONE@dummy.test",
                "two@dummy.test",
                "three@dummy.test",
              ],
              rejected: [],
            },
          ),
        ).toMatchObject({
          kind:
            "FULL_ACCEPTANCE",
        });
      },
    );

    it(
      "treats complete rejection as retryable because zero recipients were accepted",
      () => {
        expect(
          classifyEmailTransportOutcome(
            message,
            {
              transportCode:
                "TEST_SMTP",
              providerMessageId:
                null,
              accepted: [],
              rejected: [
                "one@dummy.test",
                "two@dummy.test",
                "three@dummy.test",
              ],
            },
          ),
        ).toMatchObject({
          kind:
            "FULL_REJECTION",
          failureClass:
            "RETRYABLE",
          errorCode:
            "DELIVERY_ALL_RECIPIENTS_REJECTED",
        });
      },
    );

    it(
      "blocks automatic retry after partial acceptance",
      () => {
        expect(
          classifyEmailTransportOutcome(
            message,
            {
              transportCode:
                "TEST_SMTP",
              providerMessageId:
                "message-2",
              accepted: [
                "one@dummy.test",
              ],
              rejected: [
                "two@dummy.test",
                "three@dummy.test",
              ],
            },
          ),
        ).toMatchObject({
          kind:
            "PARTIAL_ACCEPTANCE",
          failureClass:
            "OUTCOME_UNKNOWN",
          errorCode:
            "DELIVERY_PARTIAL_ACCEPTANCE",
        });
      },
    );

    it(
      "blocks automatic retry when provider evidence is incomplete",
      () => {
        expect(
          classifyEmailTransportOutcome(
            message,
            {
              transportCode:
                "TEST_SMTP",
              providerMessageId:
                "message-3",
              accepted: [
                "one@dummy.test",
              ],
              rejected: [],
            },
          ),
        ).toMatchObject({
          kind:
            "INCOMPLETE_ACCEPTANCE_EVIDENCE",
          failureClass:
            "OUTCOME_UNKNOWN",
        });
      },
    );

    it(
      "does not mark SENT when provider reports an unexpected accepted recipient",
      () => {
        expect(
          classifyEmailTransportOutcome(
            message,
            {
              transportCode:
                "TEST_SMTP",
              providerMessageId:
                "message-4",
              accepted: [
                "one@dummy.test",
                "two@dummy.test",
                "three@dummy.test",
                "unexpected@dummy.test",
              ],
              rejected: [],
            },
          ),
        ).toMatchObject({
          kind:
            "INCOMPLETE_ACCEPTANCE_EVIDENCE",
          failureClass:
            "OUTCOME_UNKNOWN",
        });
      },
    );
  },
);
