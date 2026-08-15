import { PrismaClient } from "@prisma/client";

import { getServerEnv } from "@/config/server-env";

const db = new PrismaClient();

let stopping = false;

async function maintenanceCycle(): Promise<void> {
  const result = await db.authSession.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });

  if (result.count > 0) {
    console.info(`Removed ${result.count} expired ati-ph session(s).`);
  }
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main(): Promise<void> {
  const { WORKER_POLL_INTERVAL_MS } = getServerEnv();
  console.info("ati-ph worker started");

  while (!stopping) {
    try {
      await maintenanceCycle();
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
