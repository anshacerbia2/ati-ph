import "server-only";

import { Prisma, type NotificationJobStatus } from "@prisma/client";

import { db } from "@/lib/db";
import {
  notificationApprovalListState,
} from "@/notifications/approval-list-state";
import {
  buildOccurrenceNotificationPlan,
  NotificationPlanningError,
} from "@/notifications/plan-engine";
import type { NotificationListQuery } from "@/notifications/list-query";

export { NotificationPlanningError };

/**
 * Job counts per status for one occurrence, plus their sum.
 *
 * Every status is present and zero-filled rather than omitted when empty, so a caller
 * renders `0 failed` by reading a number instead of by knowing that a missing key means
 * none. The two are the same fact and only one of them survives a refactor.
 */
export type NotificationJobStatusCounts = Record<
  NotificationJobStatus,
  number
> & { total: number };

const JOB_STATUSES = [
  "WAITING_APPROVAL",
  "PLANNED",
  "DUE",
  "PROCESSING",
  "RETRY_WAIT",
  "SENT",
  "FAILED",
  "CANCELLED",
] as const satisfies readonly NotificationJobStatus[];

function emptyJobStatusCounts(): NotificationJobStatusCounts {
  const counts = { total: 0 } as NotificationJobStatusCounts;
  for (const status of JOB_STATUSES) counts[status] = 0;
  return counts;
}

export async function listPublishedOccurrences(
  query: NotificationListQuery,
) {
  const textFilter = {
    contains: query.search,
    mode: "insensitive" as const,
  };

  const where: Prisma.HolidayOccurrenceWhereInput = {
    supersededAt: null,
    ...(query.search
      ? {
          OR: [
            { definition: { canonicalName: textFilter } },
            {
              regions: {
                some: {
                  calendarRegion: { displayName: textFilter },
                },
              },
            },
          ],
        }
      : {}),
  };

  const total = await db.holidayOccurrence.count({ where });
  const pageCount = Math.max(
    1,
    Math.ceil(total / query.pageSize),
  );
  const page = Math.min(query.page, pageCount);
  const offset = (page - 1) * query.pageSize;

  const occurrences = await db.holidayOccurrence.findMany({
    where,
    include: {
      definition: {
        select: { id: true, canonicalName: true },
      },
      regions: {
        include: {
          calendarRegion: {
            select: {
              id: true,
              code: true,
              displayName: true,
            },
          },
        },
      },
    },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    skip: offset,
    take: query.pageSize,
  });

  const occurrenceIds = occurrences.map(
    (occurrence) => occurrence.id,
  );

  const [approvalRows, jobStatusRows] =
    occurrenceIds.length > 0
      ? await Promise.all([
          db.approvalRequest.findMany({
            where: {
              resourceType: "NotificationPlan",
              resourceId: { in: occurrenceIds },
            },
            orderBy: [
              { requestedAt: "desc" },
              { id: "desc" },
            ],
            select: {
              resourceId: true,
              status: true,
            },
          }),
          db.notificationJob.groupBy({
            by: ["holidayOccurrenceId", "status"],
            where: {
              holidayOccurrenceId: {
                in: occurrenceIds,
              },
            },
            _count: { _all: true },
          }),
        ])
      : [[], []];

  const latestApprovalByOccurrence = new Map<
    string,
    (typeof approvalRows)[number]["status"]
  >();

  for (const approval of approvalRows) {
    if (
      !latestApprovalByOccurrence.has(
        approval.resourceId,
      )
    ) {
      latestApprovalByOccurrence.set(
        approval.resourceId,
        approval.status,
      );
    }
  }

  /*
   * Every status, not only the one the approval badge needed.
   *
   * The `groupBy` above has always returned counts for `SENT`, `FAILED`, `DUE` and the
   * rest, and this loop threw them away — so the row said `Committed` on the day it was
   * committed and went on saying it while the jobs underneath were delivered, failed and
   * retried. The badge stopped being informative at exactly the moment something started
   * happening, and the query was already paying for the answer.
   */
  const deliveryByOccurrence = new Map<
    string,
    NotificationJobStatusCounts
  >();

  for (const row of jobStatusRows) {
    const counts =
      deliveryByOccurrence.get(row.holidayOccurrenceId) ??
      emptyJobStatusCounts();

    counts[row.status] = row._count._all;
    counts.total += row._count._all;

    deliveryByOccurrence.set(
      row.holidayOccurrenceId,
      counts,
    );
  }

  return {
    occurrences: occurrences.map((occurrence) => ({
      id: occurrence.id,
      holidayName: occurrence.definition.canonicalName,
      startDate: dateKey(occurrence.startDate),
      endDate: dateKey(occurrence.endDate),
      calendarYear: occurrence.calendarYear,
      publishedAt: occurrence.publishedAt,
      notificationCommittedAt:
        occurrence.notificationCommittedAt,
      approvalState: notificationApprovalListState({
        committed: Boolean(
          occurrence.notificationCommittedAt,
        ),
        latestApprovalStatus:
          latestApprovalByOccurrence.get(
            occurrence.id,
          ) ?? null,
        waitingApprovalCount:
          deliveryByOccurrence.get(occurrence.id)
            ?.WAITING_APPROVAL ?? 0,
      }),
      /**
       * What actually happened to this occurrence's jobs.
       *
       * Deliberately the raw counts rather than a single summarising word. A row can be
       * partly delivered and partly failed at the same time, and any one label for that
       * would have to choose which half to hide — on a screen whose job is to answer
       * "was this holiday notified, and to whom".
       */
      delivery:
        deliveryByOccurrence.get(occurrence.id) ??
        emptyJobStatusCounts(),
      regions: occurrence.regions
        .map((item) => item.calendarRegion)
        .sort((left, right) =>
          left.code.localeCompare(right.code),
        ),
    })),
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

export async function previewOccurrenceMatching(
  occurrenceId: string,
) {
  return buildOccurrenceNotificationPlan(db, occurrenceId);
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}
