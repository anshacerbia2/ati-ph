import { createHash } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { getServerEnv } from "@/config/server-env";
import { createConfiguredEmailDelivery } from "@/email/factory";
import { evaluateSmtpPilotGate } from "@/email/smtp-pilot-rules";
import { composeStreamNotificationEmail } from "@/notifications/email-composer";

const db = new PrismaClient();

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function normalizeAddresses(values: string[]): string[] {
  return values.map((value) => value.trim().toLowerCase());
}

async function main(): Promise<void> {
  if (!process.argv.includes("--send")) {
    throw new Error(
      "Refusing to send. Re-run with explicit --send after reviewing the selected NotificationJob.",
    );
  }

  const jobId = argValue("--job");
  if (!jobId) {
    throw new Error(
      "NotificationJob id is required. Example: npm run notification:smtp:pilot -- --job <uuid> --send",
    );
  }

  const env = getServerEnv();
  const gate = evaluateSmtpPilotGate({
    mode: env.EMAIL_DELIVERY_MODE,
    enabled: env.EMAIL_SMTP_PILOT_ENABLED === "true",
    fromAddress: env.EMAIL_FROM_ADDRESS,
    recipient: env.EMAIL_SMTP_PILOT_RECIPIENT,
  });

  if (!gate.ok) {
    throw new Error(gate.reason);
  }

  const configured = createConfiguredEmailDelivery(env);
  if (!configured || configured.mode !== "SMTP") {
    throw new Error("SMTP Email Delivery Engine is not configured.");
  }

  const job = await db.notificationJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      idempotencyKey: true,
      retryCeiling: true,
      recipientSnapshot: true,
      ruleSnapshot: true,
      contentSnapshot: true,
      contentSha256: true,
      scheduledAt: true,
      targetHolidayDate: true,
    },
  });

  if (!job) {
    throw new Error(`NotificationJob ${jobId} was not found.`);
  }

  if (job.status !== "PLANNED" && job.status !== "DUE") {
    throw new Error(
      `NotificationJob ${job.id} must be PLANNED or DUE for the SMTP pilot; current status is ${job.status}.`,
    );
  }

  const pilotIdempotencyKey = createHash("sha256")
    .update(
      [
        "notification-smtp-pilot-v1",
        job.idempotencyKey,
        gate.recipient,
      ].join("|"),
    )
    .digest("hex");

  const message = composeStreamNotificationEmail({
    senderIdentityCode: configured.senderIdentityCode,
    claim: {
      attemptId: `smtp-pilot:${job.id}`,
      jobId: job.id,
      attemptNumber: 0,
      leaseExpiresAt: new Date(0),
      idempotencyKey: pilotIdempotencyKey,
      retryCeiling: job.retryCeiling,
      recipientSnapshot: job.recipientSnapshot,
      ruleSnapshot: job.ruleSnapshot,
      contentSnapshot: job.contentSnapshot,
      contentSha256: job.contentSha256,
    },
  });

  // Critical pilot safety boundary:
  // preserve the exact frozen job content, but never deliver to the frozen
  // client recipient snapshot during this pre-production pilot.
  message.to = [{ email: gate.recipient }];
  message.cc = [];
  message.bcc = [];
  message.idempotencyKey = pilotIdempotencyKey;
  message.headers = {
    ...message.headers,
    "X-ATI-Content-Mode": "GOVERNED_TEMPLATE_SMTP_PILOT",
    "X-ATI-SMTP-Pilot": "true",
  };

  console.log("CONTROLLED SMTP PILOT");
  console.log(
    JSON.stringify(
      {
        jobId: job.id,
        jobStatus: job.status,
        scheduledAt: job.scheduledAt.toISOString(),
        targetHolidayDate: job.targetHolidayDate
          .toISOString()
          .slice(0, 10),
        originalRecipientSnapshotRetainedOnlyAsEvidence: true,
        pilotRecipient: gate.recipient,
        senderDomain: gate.domain,
        contentSha256: job.contentSha256,
        transportCode: configured.transportCode,
      },
      null,
      2,
    ),
  );

  const result = await configured.engine.send(message);
  const accepted = normalizeAddresses(result.accepted);
  const rejected = normalizeAddresses(result.rejected);

  if (
    rejected.includes(gate.recipient) ||
    !accepted.includes(gate.recipient)
  ) {
    throw new Error(
      `SMTP pilot was not fully accepted for ${gate.recipient}. accepted=${JSON.stringify(
        result.accepted,
      )} rejected=${JSON.stringify(result.rejected)}`,
    );
  }

  console.log("NOTIFICATION SMTP PILOT PASS");
  console.log(
    JSON.stringify(
      {
        jobId: job.id,
        transportCode: result.transportCode,
        providerMessageId: result.providerMessageId,
        accepted: result.accepted,
        rejected: result.rejected,
        durableNotificationJobMutated: false,
      },
      null,
      2,
    ),
  );
}

main()
  .finally(async () => {
    await db.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
