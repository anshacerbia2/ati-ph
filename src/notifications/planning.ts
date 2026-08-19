import "server-only";

import { Prisma } from "@prisma/client";

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

  const waitingApprovalByOccurrence =
    new Map<string, number>();

  for (const row of jobStatusRows) {
    if (row.status === "WAITING_APPROVAL") {
      waitingApprovalByOccurrence.set(
        row.holidayOccurrenceId,
        row._count._all,
      );
    }
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
          waitingApprovalByOccurrence.get(
            occurrence.id,
          ) ?? 0,
      }),
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
