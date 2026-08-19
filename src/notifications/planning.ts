import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  evaluateSubscriptionMatch,
  type MatchingOccurrenceDate,
} from "@/notifications/matching";
import type { NotificationListQuery } from "@/notifications/list-query";
import { getGlobalNotificationSchedule } from "@/notifications/global-schedule";
import { policyScheduleIssues } from "@/notifications/policy-rules";
import {
  buildNotificationSchedulePreview,
  resolveNotificationSchedulePolicy,
  scheduleCalendarRange,
} from "@/notifications/schedule";

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

  const globalSchedule = await getGlobalNotificationSchedule();
  const globalScheduleVersion = globalSchedule.currentVersion
    ? {
        version: globalSchedule.currentVersion.version,
        leadTimeValue: globalSchedule.currentVersion.leadTimeValue,
        leadTimeMode: globalSchedule.currentVersion.leadTimeMode,
        sendTimeLocal: globalSchedule.currentVersion.sendTimeLocal,
        timezone: globalSchedule.currentVersion.timezone,
        weekendAdjustment: globalSchedule.currentVersion.weekendAdjustment,
        businessDayHolidayMode:
          globalSchedule.currentVersion.businessDayHolidayMode,
        approvalMode: globalSchedule.currentVersion.approvalMode,
      }
    : null;

  const calendarRange = scheduleCalendarRange(
    occurrenceDates.map((item) => item.date),
  );
  const publicHolidayDatesByRegion = await loadPublicHolidayDatesByRegion(
    regionIds,
    calendarRange,
  );

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
                scheduleSource: version.scheduleSource,
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

    const scheduleResolution =
      result.status === "MATCHED" && result.policy
        ? resolveNotificationSchedulePolicy({
            source: result.policy.scheduleSource,
            clientOverride: {
              version: result.policy.version,
              leadTimeValue: result.policy.leadTimeValue,
              leadTimeMode: result.policy.leadTimeMode,
              sendTimeLocal: result.policy.sendTimeLocal,
              timezone: result.policy.timezone,
              weekendAdjustment: result.policy.weekendAdjustment,
              businessDayHolidayMode: result.policy.businessDayHolidayMode,
              approvalMode: result.policy.approvalMode,
            },
            globalPolicy: globalScheduleVersion,
          })
        : null;

    const schedule =
      scheduleResolution?.status === "RESOLVED"
        ? buildNotificationSchedulePreview({
            targetHolidayDates: result.matchingDates,
            policy: scheduleResolution.policy,
            publicHolidayDates:
              publicHolidayDatesByRegion.get(subscription.calendarRegionId) ??
              new Set<string>(),
          })
        : scheduleResolution?.status === "BLOCKED"
          ? {
              status: "BLOCKED" as const,
              reasons: scheduleResolution.reasons,
              candidates: result.matchingDates.map((targetHolidayDate) => ({
                status: "BLOCKED" as const,
                targetHolidayDate,
                reasons: scheduleResolution.reasons,
              })),
            }
          : null;

    const effectiveScheduleIssues =
      scheduleResolution?.status === "RESOLVED"
        ? policyScheduleIssues(scheduleResolution.policy)
        : scheduleResolution?.status === "BLOCKED"
          ? scheduleResolution.reasons
          : [];

    return {
      ...result,
      scheduleResolution:
        scheduleResolution
          ? {
              source: scheduleResolution.source,
              sourceVersion: scheduleResolution.sourceVersion,
              ready:
                scheduleResolution.status === "RESOLVED" &&
                effectiveScheduleIssues.length === 0,
              issues: effectiveScheduleIssues,
            }
          : null,
      schedule,
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
        (result) => result.status === "MATCHED" && result.schedule?.status === "READY",
      ).length,
    },
    results,
    mode: "SHADOW_MATCHING_AND_SCHEDULING" as const,
  };
}

async function loadPublicHolidayDatesByRegion(
  regionIds: string[],
  range: { startDate: string; endDate: string },
): Promise<Map<string, Set<string>>> {
  const rows = await db.holidayOccurrenceDate.findMany({
    where: {
      occurrenceDate: {
        gte: dateFromKey(range.startDate),
        lte: dateFromKey(range.endDate),
      },
      occurrence: {
        supersededAt: null,
        regions: {
          some: { calendarRegionId: { in: regionIds } },
        },
      },
    },
    include: {
      occurrence: {
        select: {
          regions: {
            select: { calendarRegionId: true },
          },
        },
      },
    },
    orderBy: { occurrenceDate: "asc" },
  });

  const requested = new Set(regionIds);
  const byRegion = new Map<string, Set<string>>();

  for (const row of rows) {
    const date = dateKey(row.occurrenceDate);

    for (const region of row.occurrence.regions) {
      if (!requested.has(region.calendarRegionId)) continue;

      const dates = byRegion.get(region.calendarRegionId) ?? new Set<string>();
      dates.add(date);
      byRegion.set(region.calendarRegionId, dates);
    }
  }

  return byRegion;
}

function dateFromKey(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
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
