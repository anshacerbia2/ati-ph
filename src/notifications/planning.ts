import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  evaluateSubscriptionMatch,
  type MatchingOccurrenceDate,
} from "@/notifications/matching";
import type { NotificationListQuery } from "@/notifications/list-query";

export class NotificationPlanningError extends Error {
  constructor(
    public readonly code: "OCCURRENCE_NOT_FOUND" | "INVALID_CANONICAL_DAY_TYPE",
    message: string,
    public readonly status: 404 | 409,
  ) {
    super(message);
    this.name = "NotificationPlanningError";
  }
}

export async function listPublishedOccurrences(query: NotificationListQuery) {
  const textFilter = { contains: query.search, mode: "insensitive" as const };
  const where: Prisma.HolidayOccurrenceWhereInput = {
    supersededAt: null,
    ...(query.search
      ? {
          OR: [
            { definition: { canonicalName: textFilter } },
            {
              regions: {
                some: { calendarRegion: { displayName: textFilter } },
              },
            },
          ],
        }
      : {}),
  };

  const total = await db.holidayOccurrence.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const offset = (page - 1) * query.pageSize;

  const occurrences = await db.holidayOccurrence.findMany({
    where,
    include: {
      definition: { select: { id: true, canonicalName: true } },
      regions: {
        include: {
          calendarRegion: { select: { id: true, code: true, displayName: true } },
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
      regions: occurrence.regions
        .map((item) => item.calendarRegion)
        .sort((left, right) => left.code.localeCompare(right.code)),
    })),
    pagination: {
      page,
      pageSize: query.pageSize,
      pageCount,
      total,
      from: total === 0 ? 0 : offset + 1,
      to: total === 0 ? 0 : Math.min(offset + query.pageSize, total),
    },
  };
}

export async function previewOccurrenceMatching(occurrenceId: string) {
  const occurrence = await db.holidayOccurrence.findUnique({
    where: { id: occurrenceId },
    include: {
      definition: true,
      dates: { orderBy: { occurrenceDate: "asc" } },
      regions: { include: { calendarRegion: true } },
    },
  });

  if (!occurrence || occurrence.supersededAt) {
    throw new NotificationPlanningError(
      "OCCURRENCE_NOT_FOUND",
      "Published holiday occurrence was not found.",
      404,
    );
  }

  const occurrenceDates: MatchingOccurrenceDate[] = occurrence.dates.map((item) => ({
    date: dateKey(item.occurrenceDate),
    dayType: canonicalDayType(item.dayType),
  }));
  const regionIds = occurrence.regions.map((item) => item.calendarRegionId);

  const subscriptions = await db.clientSubscription.findMany({
    where: { calendarRegionId: { in: regionIds } },
    include: {
      calendarRegion: true,
      serviceTeam: { include: { client: true } },
      recipients: { include: { contact: true } },
      notificationPolicy: {
        include: {
          versions: {
            where: { isActive: true },
            orderBy: { version: "desc" },
          },
        },
      },
    },
    orderBy: [
      { serviceTeam: { client: { name: "asc" } } },
      { createdAt: "asc" },
    ],
  });

  const results = subscriptions.map((subscription) => {
    const result = evaluateSubscriptionMatch(
      {
        id: subscription.id,
        isActive: subscription.isActive,
        effectiveFrom: nullableDateKey(subscription.effectiveFrom),
        effectiveTo: nullableDateKey(subscription.effectiveTo),
        client: {
          id: subscription.serviceTeam.client.id,
          name: subscription.serviceTeam.client.name,
          isActive: subscription.serviceTeam.client.isActive,
        },
        serviceTeam: {
          id: subscription.serviceTeam.id,
          name: subscription.serviceTeam.name,
          isActive: subscription.serviceTeam.isActive,
        },
        policy: subscription.notificationPolicy
          ? {
              id: subscription.notificationPolicy.id,
              isActive: subscription.notificationPolicy.isActive,
              versions: subscription.notificationPolicy.versions.map((version) => ({
                id: version.id,
                version: version.version,
                isActive: version.isActive,
                holidayDayFilter: version.holidayDayFilter,
                leadTimeValue: version.leadTimeValue,
                leadTimeMode: version.leadTimeMode,
                sendTimeLocal: version.sendTimeLocal,
                timezone: version.timezone,
                weekendAdjustment: version.weekendAdjustment,
                businessDayHolidayMode: version.businessDayHolidayMode,
                approvalMode: version.approvalMode,
              })),
            }
          : null,
        recipients: subscription.recipients.map((recipient) => ({
          isActive: recipient.isActive,
          recipientType: recipient.recipientType,
          contact: {
            id: recipient.contact.id,
            displayName: recipient.contact.displayName,
            email: recipient.contact.email,
            isActive: recipient.contact.isActive,
          },
        })),
      },
      occurrenceDates,
    );

    return {
      ...result,
      legacyClientMasterTag: subscription.legacyClientMasterTag,
      calendarRegion: {
        id: subscription.calendarRegion.id,
        code: subscription.calendarRegion.code,
        displayName: subscription.calendarRegion.displayName,
      },
    };
  });

  const regionCoverage = occurrence.regions
    .map((item) => {
      const regionalResults = results.filter(
        (result) => result.calendarRegion.id === item.calendarRegionId,
      );
      return {
        id: item.calendarRegion.id,
        code: item.calendarRegion.code,
        displayName: item.calendarRegion.displayName,
        candidates: regionalResults.length,
        matched: regionalResults.filter((result) => result.status === "MATCHED").length,
        excluded: regionalResults.filter((result) => result.status === "EXCLUDED").length,
        exceptions: regionalResults.filter((result) => result.status === "EXCEPTION").length,
      };
    })
    .sort((left, right) => left.code.localeCompare(right.code));

  return {
    occurrence: {
      id: occurrence.id,
      holidayName: occurrence.definition.canonicalName,
      startDate: dateKey(occurrence.startDate),
      endDate: dateKey(occurrence.endDate),
      dates: occurrenceDates,
      regions: regionCoverage,
    },
    summary: {
      candidates: results.length,
      matched: results.filter((result) => result.status === "MATCHED").length,
      excluded: results.filter((result) => result.status === "EXCLUDED").length,
      exceptions: results.filter((result) => result.status === "EXCEPTION").length,
      scheduleReady: results.filter(
        (result) => result.status === "MATCHED" && result.policy?.scheduleReady,
      ).length,
    },
    results,
    mode: "SHADOW_MATCHING_ONLY" as const,
  };
}

function canonicalDayType(value: string): MatchingOccurrenceDate["dayType"] {
  if (value === "WEEKDAY" || value === "WEEKEND") return value;
  throw new NotificationPlanningError(
    "INVALID_CANONICAL_DAY_TYPE",
    `Canonical occurrence day type ${value} is not supported.`,
    409,
  );
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function nullableDateKey(value: Date | null): string | null {
  return value ? dateKey(value) : null;
}
