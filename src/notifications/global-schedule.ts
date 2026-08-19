import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  isValidTimeZone,
  policyScheduleIssues,
  type PolicyScheduleShape,
} from "@/notifications/policy-rules";

export class GlobalScheduleError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "GLOBAL_SCHEDULE_NOT_FOUND"
      | "GLOBAL_SCHEDULE_INACTIVE",
    message: string,
    public readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "GlobalScheduleError";
  }
}

const GLOBAL_SCOPE_KEY = "GLOBAL";

const globalScheduleVersionSchema = z
  .object({
    leadTimeValue: z.number().int().min(0).max(365).nullable(),
    leadTimeMode: z.enum(["CALENDAR_DAY", "BUSINESS_DAY"]).nullable(),
    sendTimeLocal: z.union([
      z
        .string()
        .trim()
        .regex(
          /^(?:[01]\d|2[0-3]):[0-5]\d$/,
          "sendTimeLocal must use HH:mm.",
        ),
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
  });

type GlobalScheduleReader = Pick<
  Prisma.TransactionClient,
  "notificationSchedulePolicy"
>;

export async function getGlobalNotificationSchedule(
  database: GlobalScheduleReader = db,
) {
  const policy = await database.notificationSchedulePolicy.findUnique({
    where: { scopeKey: GLOBAL_SCOPE_KEY },
    include: {
      versions: { orderBy: { version: "desc" }, take: 10 },
      _count: { select: { versions: true } },
    },
  });

  if (!policy) {
    return {
      id: null,
      isActive: false,
      versionCount: 0,
      currentVersion: null,
      recentVersions: [],
    };
  }

  const currentVersion =
    policy.versions.find((version) => version.isActive) ?? null;

  return {
    id: policy.id,
    isActive: policy.isActive,
    versionCount: policy._count.versions,
    currentVersion: currentVersion
      ? globalScheduleVersionView(currentVersion)
      : null,
    recentVersions: policy.versions.map(globalScheduleVersionView),
  };
}

export async function createGlobalNotificationScheduleVersion(
  input: unknown,
  actorId: string,
) {
  const parsed = globalScheduleVersionSchema.safeParse(input);
  if (!parsed.success) {
    throw new GlobalScheduleError(
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Invalid global schedule input.",
      400,
    );
  }

  return db.$transaction(async (tx) => {
    const policy = await tx.notificationSchedulePolicy.findUnique({
      where: { scopeKey: GLOBAL_SCOPE_KEY },
    });

    if (!policy) {
      throw new GlobalScheduleError(
        "GLOBAL_SCHEDULE_NOT_FOUND",
        "Global notification schedule was not found.",
        404,
      );
    }

    if (!policy.isActive) {
      throw new GlobalScheduleError(
        "GLOBAL_SCHEDULE_INACTIVE",
        "Global notification schedule is inactive.",
        409,
      );
    }

    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${policy.id}),
        hashtext('global-notification-schedule-version')
      )
    `;

    const latest = await tx.notificationSchedulePolicyVersion.findFirst({
      where: { notificationSchedulePolicyId: policy.id },
      orderBy: { version: "desc" },
    });

    await tx.notificationSchedulePolicyVersion.updateMany({
      where: {
        notificationSchedulePolicyId: policy.id,
        isActive: true,
      },
      data: { isActive: false },
    });

    const version = await tx.notificationSchedulePolicyVersion.create({
      data: {
        notificationSchedulePolicyId: policy.id,
        version: (latest?.version ?? 0) + 1,
        leadTimeValue: parsed.data.leadTimeValue,
        leadTimeMode: parsed.data.leadTimeMode,
        sendTimeLocal: parsed.data.sendTimeLocal,
        timezone: parsed.data.timezone,
        weekendAdjustment: parsed.data.weekendAdjustment,
        businessDayHolidayMode: parsed.data.businessDayHolidayMode,
        approvalMode: parsed.data.approvalMode,
        isActive: true,
        changeReason: parsed.data.changeReason,
      },
    });

    await tx.auditEvent.create({
      data: {
        userId: actorId,
        action: "GLOBAL_NOTIFICATION_SCHEDULE_VERSION_CREATED",
        entityType: "NotificationSchedulePolicyVersion",
        entityId: version.id,
        metadata: {
          notificationSchedulePolicyId: policy.id,
          version: version.version,
        },
      },
    });

    return globalScheduleVersionView(version);
  });
}

export function globalScheduleVersionView<
  T extends PolicyScheduleShape & {
    id: string;
    version: number;
    isActive: boolean;
    changeReason: string | null;
    createdAt: Date;
  },
>(version: T) {
  const scheduleIssues = policyScheduleIssues(version);

  return {
    id: version.id,
    version: version.version,
    leadTimeValue: version.leadTimeValue,
    leadTimeMode: version.leadTimeMode,
    sendTimeLocal: version.sendTimeLocal,
    timezone: version.timezone,
    weekendAdjustment: version.weekendAdjustment,
    businessDayHolidayMode: version.businessDayHolidayMode,
    approvalMode: version.approvalMode,
    isActive: version.isActive,
    changeReason: version.changeReason,
    createdAt: version.createdAt,
    scheduleReady: scheduleIssues.length === 0,
    scheduleIssues,
  };
}
