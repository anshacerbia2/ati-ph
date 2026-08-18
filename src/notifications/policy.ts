import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import type { NotificationListQuery } from "@/notifications/list-query";
import { isValidTimeZone, policyScheduleIssues } from "@/notifications/policy-rules";

export class NotificationPolicyError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "POLICY_NOT_FOUND"
      | "POLICY_INACTIVE"
      | "DELIVERY_NOT_AVAILABLE",
    message: string,
    public readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "NotificationPolicyError";
  }
}

const createPolicyVersionSchema = z
  .object({
    holidayDayFilter: z.enum(["WEEKDAY", "WEEKEND", "ALL"]),
    leadTimeValue: z.number().int().min(0).max(365).nullable(),
    leadTimeMode: z.enum(["CALENDAR_DAY", "BUSINESS_DAY"]).nullable(),
    sendTimeLocal: z
      .union([
        z.string().trim().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "sendTimeLocal must use HH:mm."),
        z.null(),
      ]),
    timezone: z.union([z.string().trim().min(1).max(100), z.null()]),
    weekendAdjustment: z.enum([
      "UNCONFIRMED",
      "NONE",
      "PREVIOUS_BUSINESS_DAY",
      "NEXT_BUSINESS_DAY",
    ]),
    businessDayHolidayMode: z.enum([
      "UNCONFIRMED",
      "EXCLUDE_PUBLIC_HOLIDAYS",
      "IGNORE_PUBLIC_HOLIDAYS",
    ]),
    approvalMode: z.enum(["UNCONFIRMED", "REQUIRED", "NOT_REQUIRED"]),
    retryCeiling: z.number().int().min(0).max(20).nullable(),
    automaticSendAllowed: z.boolean().default(false),
    changeReason: z.string().trim().min(3).max(500),
  })
  .superRefine((value, context) => {
    if (value.timezone && !isValidTimeZone(value.timezone)) {
      context.addIssue({
        code: "custom",
        path: ["timezone"],
        message: "timezone must be a valid IANA timezone.",
      });
    }

    if (value.automaticSendAllowed) {
      context.addIssue({
        code: "custom",
        path: ["automaticSendAllowed"],
        message: "Automatic send cannot be enabled before the controlled delivery phase.",
      });
    }
  });

export async function listNotificationPolicies(query: NotificationListQuery) {
  const textFilter = {
    contains: query.search,
    mode: "insensitive" as const,
  };

  const where: Prisma.NotificationPolicyWhereInput = query.search
    ? {
        OR: [
          { subscription: { serviceTeam: { client: { name: textFilter } } } },
          { subscription: { serviceTeam: { name: textFilter } } },
          { subscription: { calendarRegion: { displayName: textFilter } } },
        ],
      }
    : {};

  const total = await db.notificationPolicy.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const offset = (page - 1) * query.pageSize;

  const policies = await db.notificationPolicy.findMany({
    where,
    include: {
      subscription: {
        include: {
          calendarRegion: {
            select: { id: true, code: true, displayName: true, isActive: true },
          },
          serviceTeam: {
            include: {
              client: { select: { id: true, name: true, isActive: true } },
            },
          },
        },
      },
      versions: { orderBy: { version: "desc" }, take: 10 },
      _count: { select: { versions: true } },
    },
    orderBy: [
      { subscription: { serviceTeam: { client: { name: "asc" } } } },
      { createdAt: "asc" },
    ],
    skip: offset,
    take: query.pageSize,
  });

  return {
    policies: policies.map((policy) => {
      const currentVersion = policy.versions.find((version) => version.isActive) ?? null;
      return {
        id: policy.id,
        isActive: policy.isActive,
        client: policy.subscription.serviceTeam.client,
        serviceTeam: {
          id: policy.subscription.serviceTeam.id,
          name: policy.subscription.serviceTeam.name,
          isActive: policy.subscription.serviceTeam.isActive,
        },
        subscription: {
          id: policy.subscription.id,
          isActive: policy.subscription.isActive,
          effectiveFrom: dateKey(policy.subscription.effectiveFrom),
          effectiveTo: dateKey(policy.subscription.effectiveTo),
        },
        calendarRegion: policy.subscription.calendarRegion,
        versionCount: policy._count.versions,
        currentVersion: currentVersion ? policyVersionView(currentVersion) : null,
        recentVersions: policy.versions.map(policyVersionView),
      };
    }),
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

export async function createNotificationPolicyVersion(
  policyId: string,
  input: unknown,
  actorId: string,
) {
  const parsed = parseInput(input);

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${policyId}),
        hashtext('notification-policy-version')
      )
    `;

    const policy = await tx.notificationPolicy.findUnique({
      where: { id: policyId },
      include: {
        subscription: {
          include: { serviceTeam: { include: { client: true } } },
        },
      },
    });

    if (!policy) {
      throw new NotificationPolicyError("POLICY_NOT_FOUND", "Notification policy was not found.", 404);
    }

    if (
      !policy.isActive ||
      !policy.subscription.isActive ||
      !policy.subscription.serviceTeam.isActive ||
      !policy.subscription.serviceTeam.client.isActive
    ) {
      throw new NotificationPolicyError(
        "POLICY_INACTIVE",
        "A new policy version requires an active client, service team, subscription, and policy.",
        409,
      );
    }

    const latest = await tx.notificationPolicyVersion.findFirst({
      where: { notificationPolicyId: policyId },
      orderBy: { version: "desc" },
    });

    await tx.notificationPolicyVersion.updateMany({
      where: { notificationPolicyId: policyId, isActive: true },
      data: { isActive: false },
    });

    const version = await tx.notificationPolicyVersion.create({
      data: {
        notificationPolicyId: policyId,
        version: (latest?.version ?? 0) + 1,
        holidayDayFilter: parsed.holidayDayFilter,
        leadTimeValue: parsed.leadTimeValue,
        leadTimeMode: parsed.leadTimeMode,
        sendTimeLocal: parsed.sendTimeLocal,
        timezone: parsed.timezone,
        weekendAdjustment: parsed.weekendAdjustment,
        businessDayHolidayMode: parsed.businessDayHolidayMode,
        approvalMode: parsed.approvalMode,
        retryCeiling: parsed.retryCeiling,
        automaticSendAllowed: false,
        changeReason: parsed.changeReason,
      },
    });

    await tx.auditEvent.create({
      data: {
        userId: actorId,
        action: "NOTIFICATION_POLICY_VERSION_CREATED",
        entityType: "NotificationPolicyVersion",
        entityId: version.id,
        metadata: {
          notificationPolicyId: policy.id,
          clientId: policy.subscription.serviceTeam.clientId,
          serviceTeamId: policy.subscription.serviceTeamId,
          subscriptionId: policy.subscription.id,
          previousVersionId: latest?.id ?? null,
          after: policyVersionView(version),
        },
      },
    });

    return policyVersionView(version);
  });
}

function parseInput(input: unknown) {
  const result = createPolicyVersionSchema.safeParse(input);
  if (result.success) return result.data;

  const automaticSendIssue = result.error.issues.find(
    (issue) => issue.path[0] === "automaticSendAllowed",
  );
  if (automaticSendIssue) {
    throw new NotificationPolicyError(
      "DELIVERY_NOT_AVAILABLE",
      automaticSendIssue.message,
      409,
    );
  }

  throw new NotificationPolicyError(
    "INVALID_INPUT",
    result.error.issues[0]?.message ?? "Invalid notification-policy input.",
    400,
  );
}

function policyVersionView(version: {
  id: string;
  version: number;
  holidayDayFilter: "WEEKDAY" | "WEEKEND" | "ALL";
  leadTimeValue: number | null;
  leadTimeMode: "CALENDAR_DAY" | "BUSINESS_DAY" | null;
  sendTimeLocal: string | null;
  timezone: string | null;
  weekendAdjustment: "UNCONFIRMED" | "NONE" | "PREVIOUS_BUSINESS_DAY" | "NEXT_BUSINESS_DAY";
  businessDayHolidayMode: "UNCONFIRMED" | "EXCLUDE_PUBLIC_HOLIDAYS" | "IGNORE_PUBLIC_HOLIDAYS";
  approvalMode: "UNCONFIRMED" | "REQUIRED" | "NOT_REQUIRED";
  automaticSendAllowed: boolean;
  retryCeiling: number | null;
  isActive: boolean;
  changeReason: string | null;
  createdAt: Date;
}) {
  const scheduleIssues = policyScheduleIssues(version);
  return {
    id: version.id,
    version: version.version,
    holidayDayFilter: version.holidayDayFilter,
    leadTimeValue: version.leadTimeValue,
    leadTimeMode: version.leadTimeMode,
    sendTimeLocal: version.sendTimeLocal,
    timezone: version.timezone,
    weekendAdjustment: version.weekendAdjustment,
    businessDayHolidayMode: version.businessDayHolidayMode,
    approvalMode: version.approvalMode,
    automaticSendAllowed: version.automaticSendAllowed,
    retryCeiling: version.retryCeiling,
    isActive: version.isActive,
    changeReason: version.changeReason,
    createdAt: version.createdAt,
    scheduleReady: scheduleIssues.length === 0,
    scheduleIssues,
  };
}

function dateKey(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}
