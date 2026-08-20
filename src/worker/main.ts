import { PrismaClient } from "@prisma/client";

import { getServerEnv } from "@/config/server-env";
import {
  resolveEmailAutomaticDeliveryRelease,
} from "@/email/automatic-delivery-release";
import {
  createConfiguredEmailDelivery,
} from "@/email/factory";
import {
  claimDueNotificationJobs,
  completeNotificationDeliveryAttempt,
  promoteRetryableNotificationJobs,
  recoverExpiredNotificationDeliveryClaims,
} from "@/notifications/delivery";
import {
  executeSmtpNotificationDelivery,
  executeStreamNotificationDelivery,
} from "@/notifications/email-delivery-executor";
import { promoteDueNotificationJobs } from "@/notifications/scheduler";

const db = new PrismaClient();

let stopping = false;

type ConfiguredEmailDelivery =
  NonNullable<
    ReturnType<
      typeof createConfiguredEmailDelivery
    >
  >;

async function maintenanceCycle(
  schedulerBatchSize: number,
  deliveryBatchSize: number,
  deliveryLeaseSeconds: number,
  emailDelivery: ConfiguredEmailDelivery | null,
): Promise<void> {
  const sessionCleanup =
    await db.authSession.deleteMany({
      where: {
        expiresAt: { lte: new Date() },
      },
    });

  if (sessionCleanup.count > 0) {
    console.info(
      `Removed ${sessionCleanup.count} expired ati-ph session(s).`,
    );
  }

  const schedulerResult =
    await promoteDueNotificationJobs(db, {
      batchSize: schedulerBatchSize,
    });

  if (schedulerResult.count > 0) {
    console.info(
      `Notification scheduler marked ${schedulerResult.count} job(s) DUE.`,
    );
  }

  const recovered =
    await recoverExpiredNotificationDeliveryClaims(
      db,
      {
        batchSize: deliveryBatchSize,
      },
    );

  if (recovered.count > 0) {
    console.warn(
      `Recovered ${recovered.count} expired delivery claim(s): ${recovered.retryScheduledCount} retry scheduled, ${recovered.terminalFailureCount} terminal.`,
    );
  }

  const retriesDue =
    await promoteRetryableNotificationJobs(db, {
      batchSize: deliveryBatchSize,
    });

  if (retriesDue.count > 0) {
    console.info(
      `Notification delivery promoted ${retriesDue.count} retry job(s) to DUE.`,
    );
  }

  if (
    emailDelivery?.mode === "STREAM"
  ) {
    const claims =
      await claimDueNotificationJobs(db, {
        batchSize: deliveryBatchSize,
        leaseSeconds: deliveryLeaseSeconds,
        provider:
          emailDelivery.transportCode,
        leaseRetrySafe: true,
      });

    for (const claim of claims) {
      try {
        const result =
          await executeStreamNotificationDelivery({
            claim,
            emailEngine:
              emailDelivery.engine,
            senderIdentityCode:
              emailDelivery.senderIdentityCode,
            transportCode:
              emailDelivery.transportCode,
            complete: (completion) =>
              completeNotificationDeliveryAttempt(
                db,
                completion,
              ),
          });

        console.info(
          `Notification STREAM delivery ${result.status} for job ${result.jobId} attempt ${result.attemptId}.`,
        );
      } catch (error) {
        console.error(
          `Notification STREAM delivery execution failed for job ${claim.jobId}.`,
          error,
        );
      }
    }

    return;
  }

  if (
    emailDelivery?.mode === "SMTP"
  ) {
    const release =
      resolveEmailAutomaticDeliveryRelease();

    if (!release.canExecuteSmtpAutomatically) {
      return;
    }

    const claims =
      await claimDueNotificationJobs(db, {
        batchSize: deliveryBatchSize,
        leaseSeconds: deliveryLeaseSeconds,
        provider:
          emailDelivery.transportCode,
        leaseRetrySafe: false,
      });

    for (const claim of claims) {
      try {
        const result =
          await executeSmtpNotificationDelivery({
            claim,
            emailEngine:
              emailDelivery.engine,
            senderIdentityCode:
              emailDelivery.senderIdentityCode,
            transportCode:
              emailDelivery.transportCode,
            complete: (completion) =>
              completeNotificationDeliveryAttempt(
                db,
                completion,
              ),
          });

        console.info(
          `Notification SMTP delivery ${result.status} for job ${result.jobId} attempt ${result.attemptId}.`,
        );
      } catch (error) {
        console.error(
          `Notification SMTP delivery execution failed for job ${claim.jobId}.`,
          error,
        );
      }
    }
  }
}

async function wait(
  milliseconds: number,
): Promise<void> {
  await new Promise((resolve) =>
    setTimeout(resolve, milliseconds),
  );
}

async function main(): Promise<void> {
  const env = getServerEnv();
  const {
    WORKER_POLL_INTERVAL_MS,
    NOTIFICATION_SCHEDULER_BATCH_SIZE,
    NOTIFICATION_DELIVERY_BATCH_SIZE,
    NOTIFICATION_DELIVERY_LEASE_SECONDS,
  } = env;

  const emailDelivery =
    createConfiguredEmailDelivery(env);

  if (
    emailDelivery?.mode === "SMTP"
  ) {
    const release =
      resolveEmailAutomaticDeliveryRelease();

    if (release.canExecuteSmtpAutomatically) {
      console.warn(
        "AUTOMATIC SMTP DELIVERY IS ENABLED. SMTP claims are non-retry-safe after lease expiry and ambiguous outcomes require reconciliation.",
      );
    } else {
      console.warn(
        `SMTP transport configured; automatic NotificationJob execution remains blocked: ${release.reasons.join("; ")}.`,
      );
    }
  }

  console.info(
    emailDelivery?.mode === "STREAM"
      ? "ati-ph worker started (session maintenance + due scheduler + retry/lease recovery + safe STREAM notification delivery)"
      : emailDelivery?.mode === "SMTP"
        ? "ati-ph worker started (session maintenance + due scheduler + retry/lease recovery + double-gated SMTP delivery)"
        : "ati-ph worker started (session maintenance + due scheduler + retry/lease recovery; notification email execution disabled)",
  );

  while (!stopping) {
    try {
      await maintenanceCycle(
        NOTIFICATION_SCHEDULER_BATCH_SIZE,
        NOTIFICATION_DELIVERY_BATCH_SIZE,
        NOTIFICATION_DELIVERY_LEASE_SECONDS,
        emailDelivery,
      );
    } catch (error) {
      console.error(
        "ati-ph worker cycle failed",
        error,
      );
    }

    if (!stopping) {
      await wait(WORKER_POLL_INTERVAL_MS);
    }
  }
}

for (const signal of [
  "SIGINT",
  "SIGTERM",
] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

main()
  .catch((error) => {
    console.error(
      "ati-ph worker failed to start",
      error,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    console.info("ati-ph worker stopped");
  });
