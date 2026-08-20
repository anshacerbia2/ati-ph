import type {
  PrismaClient,
} from "@prisma/client";

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
    jobs,
    alerts: {
      openCount: openAlertCount,
      byType: alertsByType,
      items: openAlerts,
    },
    reconciliationOpenCount,
  };
}
