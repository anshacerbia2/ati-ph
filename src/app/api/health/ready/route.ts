import {
  NextResponse,
} from "next/server";

import {
  getServerEnv,
} from "@/config/server-env";
import {
  resolveEmailAutomaticDeliveryRelease,
} from "@/email/automatic-delivery-release";
import { db } from "@/lib/db";
import {
  evaluateProductionReadiness,
} from "@/operations/production-readiness";
import {
  evaluateWorkerReadiness,
} from "@/operations/readiness";

export const runtime = "nodejs";

export async function GET() {
  const startedAt = performance.now();

  try {
    const env = getServerEnv();

    await db.$queryRaw`SELECT 1`;

    const worker =
      await db.notificationWorkerState.findUnique({
        where: { id: "PRIMARY" },
        select: {
          lastSuccessfulAt: true,
          lastError: true,
        },
      });

    const trustedAutomationEnabled =
      env.NOTIFICATION_TRUSTED_AUTOMATION_ENABLED ===
      "true";
    const workerReadiness =
      evaluateWorkerReadiness({
        trustedAutomationEnabled,
        now: new Date(),
        pollIntervalMs:
          env.WORKER_POLL_INTERVAL_MS,
        lastSuccessfulAt:
          worker?.lastSuccessfulAt ?? null,
      });

    const production =
      evaluateProductionReadiness(
        process.env,
      );
    const smtp =
      resolveEmailAutomaticDeliveryRelease();

    const ready =
      production.applicationReady &&
      workerReadiness.ready;

    return NextResponse.json(
      {
        status: ready
          ? "READY"
          : "NOT_READY",
        service: "ati-ph",
        database: "UP",
        latencyMs: Math.round(
          performance.now() - startedAt,
        ),
        worker: {
          ...workerReadiness,
          lastSuccessfulAt:
            workerReadiness.lastSuccessfulAt
              ?.toISOString() ?? null,
          lastError:
            worker?.lastError ?? null,
        },
        production: {
          mode:
            production.productionMode,
          applicationReady:
            production.applicationReady,
          blockers: production.blockers,
          externalDeliveryReady:
            production.externalDeliveryReady,
          externalDeliveryBlockers:
            production.externalDeliveryBlockers,
        },
        smtp: {
          automaticEnabled:
            smtp.smtpAutomaticDeliveryEnabled,
          killSwitchActive:
            smtp.killSwitchActive,
          productionReleaseRequired:
            smtp.productionReleaseRequired,
          productionReleaseApproved:
            smtp.productionReleaseApproved,
          canExecuteAutomatically:
            smtp.canExecuteSmtpAutomatically,
        },
      },
      { status: ready ? 200 : 503 },
    );
  } catch (error) {
    console.error(
      "ATI PH readiness check failed",
      error,
    );

    return NextResponse.json(
      {
        status: "NOT_READY",
        service: "ati-ph",
        database: "DOWN",
      },
      { status: 503 },
    );
  }
}
