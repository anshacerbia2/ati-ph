import type {
  PrismaClient,
} from "@prisma/client";

const STATE_ID = "PRIMARY";

export type NotificationWorkerCycleMetrics = {
  planningScanned: number;
  planningReady: number;
  planningCommitted: number;
  planningBlocked: number;
  duePromoted: number;
  deliveryClaims: number;
  openAlertCount: number;
};

export async function markNotificationWorkerCycleStarted(
  database: PrismaClient,
  input: {
    now?: Date;
    trustedAutomationEnabled: boolean;
  },
) {
  const now = input.now ?? new Date();

  return database.notificationWorkerState.upsert({
    where: { id: STATE_ID },
    create: {
      id: STATE_ID,
      trustedAutomationEnabled:
        input.trustedAutomationEnabled,
      lastCycleStartedAt: now,
    },
    update: {
      trustedAutomationEnabled:
        input.trustedAutomationEnabled,
      lastCycleStartedAt: now,
    },
  });
}

export async function markNotificationWorkerCycleCompleted(
  database: PrismaClient,
  input: {
    now?: Date;
    trustedAutomationEnabled: boolean;
    metrics: NotificationWorkerCycleMetrics;
  },
) {
  const now = input.now ?? new Date();

  return database.notificationWorkerState.upsert({
    where: { id: STATE_ID },
    create: {
      id: STATE_ID,
      trustedAutomationEnabled:
        input.trustedAutomationEnabled,
      lastCycleStartedAt: now,
      lastCycleCompletedAt: now,
      lastSuccessfulAt: now,
      lastError: null,
      lastPlanningScanned:
        input.metrics.planningScanned,
      lastPlanningReady:
        input.metrics.planningReady,
      lastPlanningCommitted:
        input.metrics.planningCommitted,
      lastPlanningBlocked:
        input.metrics.planningBlocked,
      lastDuePromoted:
        input.metrics.duePromoted,
      lastDeliveryClaims:
        input.metrics.deliveryClaims,
      lastOpenAlertCount:
        input.metrics.openAlertCount,
    },
    update: {
      trustedAutomationEnabled:
        input.trustedAutomationEnabled,
      lastCycleCompletedAt: now,
      lastSuccessfulAt: now,
      lastError: null,
      lastPlanningScanned:
        input.metrics.planningScanned,
      lastPlanningReady:
        input.metrics.planningReady,
      lastPlanningCommitted:
        input.metrics.planningCommitted,
      lastPlanningBlocked:
        input.metrics.planningBlocked,
      lastDuePromoted:
        input.metrics.duePromoted,
      lastDeliveryClaims:
        input.metrics.deliveryClaims,
      lastOpenAlertCount:
        input.metrics.openAlertCount,
    },
  });
}

export async function markNotificationWorkerCycleFailed(
  database: PrismaClient,
  input: {
    now?: Date;
    trustedAutomationEnabled: boolean;
    error: unknown;
  },
) {
  const now = input.now ?? new Date();
  const message =
    input.error instanceof Error
      ? input.error.message
      : String(input.error);

  return database.notificationWorkerState.upsert({
    where: { id: STATE_ID },
    create: {
      id: STATE_ID,
      trustedAutomationEnabled:
        input.trustedAutomationEnabled,
      lastCycleStartedAt: now,
      lastCycleCompletedAt: now,
      lastError: message,
    },
    update: {
      trustedAutomationEnabled:
        input.trustedAutomationEnabled,
      lastCycleCompletedAt: now,
      lastError: message,
    },
  });
}
