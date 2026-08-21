import type {
  PrismaClient,
} from "@prisma/client";

import { evaluateWorkerHeartbeat } from "@/operations/readiness";

const JOB_STATUSES = [
  "WAITING_APPROVAL",
  "PLANNED",
  "DUE",
  "PROCESSING",
  "RETRY_WAIT",
  "SENT",
  "FAILED",
  "CANCELLED",
] as const;

export async function getNotificationOperationsOverview(
  database: PrismaClient,
  input: {
    trustedAutomationEnabled: boolean;
    smtpAutomaticDeliveryEnabled: boolean;
    smtpKillSwitchActive: boolean;
    smtpCanExecuteAutomatically: boolean;
    workerEnabled: boolean;
    workerPollIntervalMs: number;
    now?: Date;
  },
) {
  const [
    worker,
    jobGroups,
    openAlertGroups,
    openAlerts,
    openAlertCount,
    reconciliationOpenCount,
  ] = await Promise.all([
    database.notificationWorkerState.findUnique({
      where: { id: "PRIMARY" },
    }),
    database.notificationJob.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    database.notificationOperationalAlert.groupBy({
      by: ["type"],
      where: { status: "OPEN" },
      _count: { _all: true },
    }),
    database.notificationOperationalAlert.findMany({
      where: { status: "OPEN" },
      orderBy: [
        { lastDetectedAt: "desc" },
        { id: "asc" },
      ],
      take: 25,
      select: {
        id: true,
        alertKey: true,
        type: true,
        severity: true,
        summary: true,
        holidayOccurrenceId: true,
        notificationJobId: true,
        details: true,
        firstDetectedAt: true,
        lastDetectedAt: true,
      },
    }),
    database.notificationOperationalAlert.count({
      where: { status: "OPEN" },
    }),
    database.notificationDeliveryAttempt.count({
      where: {
        status: "FAILED",
        failureClass: "OUTCOME_UNKNOWN",
        reconciliationAction: null,
        notificationJob: {
          status: "FAILED",
        },
      },
    }),
  ]);

  const jobs = Object.fromEntries(
    JOB_STATUSES.map((status) => [
      status,
      jobGroups.find(
        (group) =>
          group.status === status,
      )?._count._all ?? 0,
    ]),
  );

  const alertsByType = Object.fromEntries(
    openAlertGroups.map((group) => [
      group.type,
      group._count._all,
    ]),
  );

  return {
    automation: {
      trustedAutomationEnabled:
        input.trustedAutomationEnabled,
      smtpAutomaticDeliveryEnabled:
        input.smtpAutomaticDeliveryEnabled,
      smtpKillSwitchActive:
        input.smtpKillSwitchActive,
      smtpCanExecuteAutomatically:
        input.smtpCanExecuteAutomatically,
    },
    worker,
    /*
     * A verdict, not a timestamp. The panel used to print the last success time and leave
     * the reader to decide whether it was normal — which needs the poll interval, which
     * was not on the screen. A dead worker and a healthy one looked the same.
     */
    workerHeartbeat: evaluateWorkerHeartbeat({
      workerEnabled: input.workerEnabled,
      now: input.now ?? new Date(),
      pollIntervalMs: input.workerPollIntervalMs,
      lastSuccessfulAt:
        worker?.lastSuccessfulAt ?? null,
    }),
    jobs,
    alerts: {
      openCount: openAlertCount,
      byType: alertsByType,
      items: openAlerts,
    },
    reconciliationOpenCount,
  };
}
