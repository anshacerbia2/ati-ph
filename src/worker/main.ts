import {
  PrismaClient,
} from "@prisma/client";

import {
  getServerEnv,
  type ServerEnv,
} from "@/config/server-env";
import {
  resolveEmailAutomaticDeliveryRelease,
} from "@/email/automatic-delivery-release";
import {
  createConfiguredEmailDelivery,
} from "@/email/factory";
import {
  runScheduledNotificationPlanning,
} from "@/notifications/automation";
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
import {
  syncDeliveryFailureAlerts,
  syncSchedulerLagAlerts,
} from "@/notifications/operational-alerts";
import {
  runNotificationOperationalRetention,
} from "@/notifications/retention";
import {
  promoteDueNotificationJobs,
} from "@/notifications/scheduler";
import {
  markNotificationWorkerCycleCompleted,
  markNotificationWorkerCycleFailed,
  markNotificationWorkerCycleStarted,
} from "@/notifications/worker-state";

const db = new PrismaClient();

let stopping = false;

type ConfiguredEmailDelivery =
  NonNullable<
    ReturnType<
      typeof createConfiguredEmailDelivery
    >
  >;

async function maintenanceCycle(
  env: ServerEnv,
  emailDelivery: ConfiguredEmailDelivery | null,
): Promise<void> {
  const trustedAutomationEnabled =
    env.NOTIFICATION_TRUSTED_AUTOMATION_ENABLED ===
    "true";
  const cycleStartedAt = new Date();

  await markNotificationWorkerCycleStarted(
    db,
    {
      now: cycleStartedAt,
      trustedAutomationEnabled,
    },
  );

  let planningScanned = 0;
  let planningReady = 0;
  let planningCommitted = 0;
  let planningBlocked = 0;
  let duePromoted = 0;
  let deliveryClaims = 0;

  try {
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

    const planning =
      await runScheduledNotificationPlanning(
        db,
        {
          batchSize:
            env.NOTIFICATION_AUTOMATION_BATCH_SIZE,
          horizonDays:
            env.NOTIFICATION_AUTOMATION_HORIZON_DAYS,
          commitEnabled:
            trustedAutomationEnabled,
        },
      );

    planningScanned =
      planning.scannedCount;
    planningReady = planning.readyCount;
    planningCommitted =
      planning.committedCount;
    planningBlocked =
      planning.blockedCount;

    if (planning.committedCount > 0) {
      console.info(
        `Trusted automation committed ${planning.committedCount} notification plan(s), including ${planning.waitingApprovalCount} job(s) waiting approval.`,
      );
    }

    await syncSchedulerLagAlerts(db, {
      thresholdSeconds:
        env.NOTIFICATION_SCHEDULER_LAG_THRESHOLD_SECONDS,
      batchSize:
        env.NOTIFICATION_AUTOMATION_BATCH_SIZE,
    });

    const schedulerResult =
      await promoteDueNotificationJobs(
        db,
        {
          batchSize:
            env.NOTIFICATION_SCHEDULER_BATCH_SIZE,
        },
      );
    duePromoted = schedulerResult.count;

    if (schedulerResult.count > 0) {
      console.info(
        `Notification scheduler marked ${schedulerResult.count} job(s) DUE.`,
      );
    }

    const recovered =
      await recoverExpiredNotificationDeliveryClaims(
        db,
        {
          batchSize:
            env.NOTIFICATION_DELIVERY_BATCH_SIZE,
        },
      );

    if (recovered.count > 0) {
      console.warn(
        `Recovered ${recovered.count} expired delivery claim(s): ${recovered.retryScheduledCount} retry scheduled, ${recovered.terminalFailureCount} terminal.`,
      );
    }

    const retriesDue =
      await promoteRetryableNotificationJobs(
        db,
        {
          batchSize:
            env.NOTIFICATION_DELIVERY_BATCH_SIZE,
        },
      );

    if (retriesDue.count > 0) {
      console.info(
        `Notification delivery promoted ${retriesDue.count} retry job(s) to DUE.`,
      );
    }

    if (
      emailDelivery?.mode === "STREAM"
    ) {
      const claims =
        await claimDueNotificationJobs(
          db,
          {
            batchSize:
              env.NOTIFICATION_DELIVERY_BATCH_SIZE,
            leaseSeconds:
              env.NOTIFICATION_DELIVERY_LEASE_SECONDS,
            provider:
              emailDelivery.transportCode,
            leaseRetrySafe: true,
          },
        );
      deliveryClaims += claims.length;

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
    } else if (
      emailDelivery?.mode === "SMTP"
    ) {
      const release =
        resolveEmailAutomaticDeliveryRelease();

      if (
        release.canExecuteSmtpAutomatically
      ) {
        const claims =
          await claimDueNotificationJobs(
            db,
            {
              batchSize:
                env.NOTIFICATION_DELIVERY_BATCH_SIZE,
              leaseSeconds:
                env.NOTIFICATION_DELIVERY_LEASE_SECONDS,
              provider:
                emailDelivery.transportCode,
              leaseRetrySafe: false,
            },
          );
        deliveryClaims += claims.length;

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

    await syncDeliveryFailureAlerts(db, {
      batchSize:
        env.NOTIFICATION_AUTOMATION_BATCH_SIZE,
    });

    await runNotificationOperationalRetention(
      db,
      {
        enabled:
          env.NOTIFICATION_RETENTION_ENABLED ===
          "true",
        alertRetentionDays:
          env.NOTIFICATION_OPERATIONAL_ALERT_RETENTION_DAYS,
        batchSize:
          env.NOTIFICATION_RETENTION_BATCH_SIZE,
      },
    );

    const openAlertCount =
      await db.notificationOperationalAlert.count({
        where: { status: "OPEN" },
      });

    await markNotificationWorkerCycleCompleted(
      db,
      {
        trustedAutomationEnabled,
        metrics: {
          planningScanned,
          planningReady,
          planningCommitted,
          planningBlocked,
          duePromoted,
          deliveryClaims,
          openAlertCount,
        },
      },
    );
  } catch (error) {
    await markNotificationWorkerCycleFailed(
      db,
      {
        trustedAutomationEnabled,
        error,
      },
    ).catch((stateError) => {
      console.error(
        "Could not persist notification worker failure state.",
        stateError,
      );
    });

    throw error;
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
  const emailDelivery =
    createConfiguredEmailDelivery(env);
  const trustedAutomationEnabled =
    env.NOTIFICATION_TRUSTED_AUTOMATION_ENABLED ===
    "true";

  if (
    emailDelivery?.mode === "SMTP"
  ) {
    const release =
      resolveEmailAutomaticDeliveryRelease();

    if (
      release.canExecuteSmtpAutomatically
    ) {
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
    trustedAutomationEnabled
      ? "Trusted notification planning automation is ENABLED."
      : "Trusted notification planning automation is SHADOW-ONLY; plans are scanned and alerts are recorded but not auto-committed.",
  );

  console.info(
    emailDelivery?.mode === "STREAM"
      ? "ati-ph worker started (trusted planning + scheduler + retry/lease recovery + safe STREAM notification delivery)"
      : emailDelivery?.mode === "SMTP"
        ? "ati-ph worker started (trusted planning + scheduler + retry/lease recovery + double-gated SMTP delivery)"
        : "ati-ph worker started (trusted planning + scheduler + retry/lease recovery; notification email execution disabled)",
  );

  while (!stopping) {
    try {
      await maintenanceCycle(
        env,
        emailDelivery,
      );
    } catch (error) {
      console.error(
        "ati-ph worker cycle failed",
        error,
      );
    }

    if (!stopping) {
      await wait(
        env.WORKER_POLL_INTERVAL_MS,
      );
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
