import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

export const ALERT_TYPES = [
  "PLANNING_BLOCKED",
  "ZERO_RECIPIENT",
  "SCHEDULER_LAG",
  "DELIVERY_FAILURE",
] as const;

export const ALERT_STATUSES = ["OPEN", "RESOLVED"] as const;

export type AlertHistoryQuery = {
  statuses: string[];
  types: string[];
  page: number;
  pageSize: number;
};

/**
 * Operational alerts, including the ones that were resolved.
 *
 * ## Why resolved alerts are worth reading
 *
 * The panel showed `status: OPEN` only, so an alert disappeared the moment it stopped
 * firing. That answers "is anything wrong now" and destroys "has this been happening" —
 * and the second question is the one that distinguishes a blip from a pattern nobody
 * has fixed.
 *
 * ## What `firstDetectedAt` means here, and what it does not
 *
 * `alertKey` is unique, so a condition that recurs updates the existing row rather than
 * inserting another: `lastDetectedAt` moves and `firstDetectedAt` stays. That makes the
 * pair a duration — *this has been happening since* — and it deliberately is **not** an
 * occurrence count. Nothing in the schema counts recurrences, and a UI that showed one
 * would be inventing it.
 *
 * A resolved alert whose condition returns is the same row again, reopened, with its
 * original `firstDetectedAt` intact. That is the behaviour worth knowing when reading
 * an old date beside an `OPEN` status.
 */
export async function listAlertHistory(
  query: AlertHistoryQuery,
): Promise<{
  alerts: Array<{
    id: string;
    alertKey: string;
    type: string;
    severity: string;
    status: string;
    summary: string;
    details: unknown;
    holidayOccurrenceId: string | null;
    notificationJobId: string | null;
    firstDetectedAt: string;
    lastDetectedAt: string;
    resolvedAt: string | null;
  }>;
  facets: {
    byStatus: Record<string, number>;
    byType: Record<string, number>;
  };
  pagination: {
    page: number;
    pageSize: number;
    pageCount: number;
    total: number;
    from: number;
    to: number;
  };
}> {
  const where: Prisma.NotificationOperationalAlertWhereInput = {
    ...(query.statuses.length > 0
      ? {
          status: {
            in: query.statuses as Prisma.EnumNotificationOperationalAlertStatusFilter["in"],
          },
        }
      : {}),
    ...(query.types.length > 0
      ? {
          type: {
            in: query.types as Prisma.EnumNotificationOperationalAlertTypeFilter["in"],
          },
        }
      : {}),
  };

  /*
   * Facets are counted over everything, not over the current filter.
   *
   * They exist to say what selecting a chip would find. Counting them inside the filter
   * makes every unselected value read zero, which is the opposite of the affordance.
   */
  const [total, statusRows, typeRows] = await Promise.all([
    db.notificationOperationalAlert.count({ where }),
    db.notificationOperationalAlert.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    db.notificationOperationalAlert.groupBy({
      by: ["type"],
      _count: { _all: true },
    }),
  ]);

  const pageCount = Math.max(
    1,
    Math.ceil(total / query.pageSize),
  );
  const page = Math.min(query.page, pageCount);
  const offset = (page - 1) * query.pageSize;

  const alerts =
    await db.notificationOperationalAlert.findMany({
      where,
      /*
       * Most recently seen first, and open before resolved at the same instant — an
       * operator opening this screen is looking for what still needs them.
       */
      orderBy: [
        { status: "asc" },
        { lastDetectedAt: "desc" },
        { id: "asc" },
      ],
      skip: offset,
      take: query.pageSize,
    });

  return {
    alerts: alerts.map((alert) => ({
      id: alert.id,
      alertKey: alert.alertKey,
      type: alert.type,
      severity: alert.severity,
      status: alert.status,
      summary: alert.summary,
      details: alert.details,
      holidayOccurrenceId: alert.holidayOccurrenceId,
      notificationJobId: alert.notificationJobId,
      firstDetectedAt: alert.firstDetectedAt.toISOString(),
      lastDetectedAt: alert.lastDetectedAt.toISOString(),
      resolvedAt: alert.resolvedAt?.toISOString() ?? null,
    })),
    facets: {
      byStatus: Object.fromEntries(
        ALERT_STATUSES.map((status) => [
          status,
          statusRows.find((row) => row.status === status)
            ?._count._all ?? 0,
        ]),
      ),
      byType: Object.fromEntries(
        ALERT_TYPES.map((type) => [
          type,
          typeRows.find((row) => row.type === type)?._count
            ._all ?? 0,
        ]),
      ),
    },
    pagination: {
      page,
      pageSize: query.pageSize,
      pageCount,
      total,
      from: total === 0 ? 0 : offset + 1,
      to:
        total === 0
          ? 0
          : Math.min(offset + query.pageSize, total),
    },
  };
}

export function parseAlertHistoryQuery(input: {
  status?: string | null;
  type?: string | null;
  page?: string | null;
}): AlertHistoryQuery {
  const requestedStatuses = csv(input.status);
  const requestedTypes = csv(input.type);

  return {
    statuses: ALERT_STATUSES.filter((status) =>
      requestedStatuses.includes(status),
    ),
    types: ALERT_TYPES.filter((type) =>
      requestedTypes.includes(type),
    ),
    page: positiveInteger(input.page, 1),
    pageSize: 25,
  };
}

function csv(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
}

function positiveInteger(
  value: string | null | undefined,
  fallback: number,
): number {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}
