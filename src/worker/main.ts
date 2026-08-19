import { PrismaClient } from "@prisma/client";

import { getServerEnv } from "@/config/server-env";
import { promoteDueNotificationJobs } from "@/notifications/scheduler";

const db = new PrismaClient();

let stopping = false;

async function maintenanceCycle(
  schedulerBatchSize: number,
): Promise<void> {
  const sessionCleanup = await db.authSession.deleteMany({
    where: { expiresAt: { lte: new Date() } },
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
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) =>
    setTimeout(resolve, milliseconds),
  );
}

async function main(): Promise<void> {
  const {
    WORKER_POLL_INTERVAL_MS,
    NOTIFICATION_SCHEDULER_BATCH_SIZE,
  } = getServerEnv();

  console.info(
    "ati-ph worker started (session maintenance + notification due scheduler; no email delivery)",
  );

  while (!stopping) {
    try {
      await maintenanceCycle(
        NOTIFICATION_SCHEDULER_BATCH_SIZE,
      );
    } catch (error) {
      console.error("ati-ph worker cycle failed", error);
    }

    if (!stopping) {
      await wait(WORKER_POLL_INTERVAL_MS);
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

main()
  .catch((error) => {
    console.error("ati-ph worker failed to start", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    console.info("ati-ph worker stopped");
  });
