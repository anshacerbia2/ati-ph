import { randomUUID } from "node:crypto";

import {
  getServerEnv,
} from "@/config/server-env";
import {
  createConfiguredEmailDelivery,
} from "@/email/factory";
import {
  smtpManualTestDecision,
} from "@/email/smtp-test-rules";

async function main(): Promise<void> {
  const env = getServerEnv();
  const decision =
    smtpManualTestDecision({
      deliveryMode:
        env.EMAIL_DELIVERY_MODE,
      testEnabled:
        env.EMAIL_SMTP_TEST_ENABLED ===
        "true",
      explicitSendFlag:
        process.argv.includes("--send"),
      fromAddress:
        env.EMAIL_FROM_ADDRESS,
      recipient:
        env.EMAIL_SMTP_TEST_RECIPIENT,
    });

  if (!decision.ok) {
    console.error(
      "SMTP MANUAL TEST REFUSED",
    );

    for (const reason of decision.reasons) {
      console.error(`- ${reason}`);
    }

    console.error(
      "No email was sent.",
    );
    process.exitCode = 2;
    return;
  }

  const configured =
    createConfiguredEmailDelivery(env);

  if (
    !configured ||
    configured.mode !== "SMTP"
  ) {
    throw new Error(
      "SMTP delivery was not configured after validation.",
    );
  }

  const now = new Date();
  const result =
    await configured.engine.send({
      senderIdentityCode:
        configured.senderIdentityCode,
      idempotencyKey:
        `manual-smtp-test:${randomUUID()}`,
      to: [
        {
          email:
            decision.recipient,
        },
      ],
      subject:
        `[ATI PH SMTP TEST] ${now.toISOString()}`,
      text: [
        "ATI PH manual SMTP connectivity test",
        "",
        "This is an explicitly triggered technical test email.",
        "It did not originate from a NotificationJob.",
        "Automatic SMTP notification delivery remains gated.",
        "",
        `Sent at: ${now.toISOString()}`,
        `Transport: ${configured.transportCode}`,
      ].join("\n"),
      headers: {
        "X-ATI-Content-Mode":
          "MANUAL_SMTP_CONNECTIVITY_TEST",
        "X-ATI-Test-Only": "true",
      },
    });

  const accepted =
    result.accepted.map((value) =>
      value.toLowerCase(),
    );
  const target =
    decision.recipient.toLowerCase();

  if (
    result.rejected.length > 0 ||
    !accepted.includes(target)
  ) {
    throw new Error(
      `SMTP test was not fully accepted: ${JSON.stringify(
        {
          transportCode:
            result.transportCode,
          providerMessageId:
            result.providerMessageId,
          accepted: result.accepted,
          rejected: result.rejected,
        },
      )}`,
    );
  }

  console.log(
    "SMTP MANUAL TEST ACCEPTED",
  );
  console.log(
    JSON.stringify(
      {
        recipient:
          decision.recipient,
        transportCode:
          result.transportCode,
        providerMessageId:
          result.providerMessageId,
        accepted: result.accepted,
        rejected: result.rejected,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    "SMTP MANUAL TEST FAILED",
    error instanceof Error
      ? error.message
      : String(error),
  );
  process.exitCode = 1;
});
