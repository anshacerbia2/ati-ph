import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
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
