import {
  policyScheduleIssues,
  type NotificationApprovalModeValue,
  type NotificationBusinessDayHolidayModeValue,
  type NotificationLeadTimeModeValue,
  type NotificationScheduleSourceValue,
  type NotificationWeekendAdjustmentValue,
  type PolicyScheduleShape,
} from "@/notifications/policy-rules";

const MAX_CALENDAR_STEPS = 800;
const CALENDAR_LOOKBACK_DAYS = 800;
const CALENDAR_LOOKAHEAD_DAYS = 31;

export type NotificationScheduleBlocked = {
  status: "BLOCKED";
  targetHolidayDate: string;
  reasons: string[];
};

export type NotificationScheduleReady = {
  status: "READY";
  targetHolidayDate: string;
  plannedLocalDate: string;
  plannedLocalTime: string;
  timezone: string;
  leadTimeValue: number;
  leadTimeMode: NotificationLeadTimeModeValue;
  weekendAdjustment: NotificationWeekendAdjustmentValue;
  businessDayHolidayMode: NotificationBusinessDayHolidayModeValue;
  approvalMode: NotificationApprovalModeValue;
  approvalRequired: boolean;
  appliedRules: string[];
};

export type NotificationScheduleCandidate =
  | NotificationScheduleBlocked
  | NotificationScheduleReady;

export type NotificationSchedulePreview = {
  status: "READY" | "BLOCKED";
  reasons: string[];
  candidates: NotificationScheduleCandidate[];
};

export type VersionedSchedulePolicy = PolicyScheduleShape & {
  version: number;
};

export type ResolvedSchedulePolicy =
  | {
      status: "RESOLVED";
      source: NotificationScheduleSourceValue;
      sourceVersion: number;
      policy: PolicyScheduleShape;
    }
  | {
      status: "BLOCKED";
      source: NotificationScheduleSourceValue;
      sourceVersion: null;
      reasons: string[];
    };

export function resolveNotificationSchedulePolicy(input: {
  source: NotificationScheduleSourceValue;
  clientOverride: VersionedSchedulePolicy;
  globalPolicy: VersionedSchedulePolicy | null;
}): ResolvedSchedulePolicy {
  if (input.source === "GLOBAL") {
    if (!input.globalPolicy) {
      return {
        status: "BLOCKED",
        source: "GLOBAL",
        sourceVersion: null,
        reasons: ["GLOBAL_SCHEDULE_UNAVAILABLE"],
      };
    }

    return {
      status: "RESOLVED",
      source: "GLOBAL",
      sourceVersion: input.globalPolicy.version,
      policy: scheduleShape(input.globalPolicy),
    };
  }

  return {
    status: "RESOLVED",
    source: "CLIENT_OVERRIDE",
    sourceVersion: input.clientOverride.version,
    policy: scheduleShape(input.clientOverride),
  };
}

export function calculateNotificationSchedule(input: {
  targetHolidayDate: string;
  policy: PolicyScheduleShape;
  publicHolidayDates?: ReadonlySet<string>;
}): NotificationScheduleCandidate {
  const { targetHolidayDate, policy } = input;
  const publicHolidayDates = input.publicHolidayDates ?? new Set<string>();
  const reasons = policyScheduleIssues(policy);

  if (!isDateKey(targetHolidayDate)) {
    reasons.push("TARGET_DATE_INVALID");
  }

  if (
    policy.leadTimeValue !== null &&
    (!Number.isInteger(policy.leadTimeValue) ||
      policy.leadTimeValue < 0 ||
      policy.leadTimeValue > 365)
  ) {
    reasons.push("LEAD_TIME_INVALID");
  }

  if (reasons.length > 0) {
    return {
      status: "BLOCKED",
      targetHolidayDate,
      reasons: [...new Set(reasons)],
    };
  }

  const leadTimeValue = policy.leadTimeValue as number;
  const leadTimeMode = policy.leadTimeMode as NotificationLeadTimeModeValue;
  const sendTimeLocal = policy.sendTimeLocal as string;
  const timezone = policy.timezone as string;
  const appliedRules: string[] = [];

  let plannedLocalDate = targetHolidayDate;

  if (leadTimeMode === "CALENDAR_DAY") {
    plannedLocalDate = shiftDateKey(plannedLocalDate, -leadTimeValue);
    appliedRules.push(
      `LEAD_TIME_${leadTimeValue}_CALENDAR_DAY${leadTimeValue === 1 ? "" : "S"}`,
    );
  } else {
    plannedLocalDate = subtractBusinessDays(
      plannedLocalDate,
      leadTimeValue,
      publicHolidayDates,
      policy.businessDayHolidayMode,
    );
    appliedRules.push(
      `LEAD_TIME_${leadTimeValue}_BUSINESS_DAY${leadTimeValue === 1 ? "" : "S"}`,
    );
  }

  if (isWeekend(plannedLocalDate)) {
    if (policy.weekendAdjustment === "PREVIOUS_BUSINESS_DAY") {
      plannedLocalDate = moveToBusinessDay(
        plannedLocalDate,
        -1,
        publicHolidayDates,
        policy.businessDayHolidayMode,
      );
      appliedRules.push("WEEKEND_TO_PREVIOUS_BUSINESS_DAY");
    } else if (policy.weekendAdjustment === "NEXT_BUSINESS_DAY") {
      plannedLocalDate = moveToBusinessDay(
        plannedLocalDate,
        1,
        publicHolidayDates,
        policy.businessDayHolidayMode,
      );
      appliedRules.push("WEEKEND_TO_NEXT_BUSINESS_DAY");
    } else {
      appliedRules.push("WEEKEND_ADJUSTMENT_NONE");
    }
  } else {
    appliedRules.push("WEEKEND_ADJUSTMENT_NOT_REQUIRED");
  }

  if (
    leadTimeMode === "BUSINESS_DAY" ||
    policy.weekendAdjustment === "PREVIOUS_BUSINESS_DAY" ||
    policy.weekendAdjustment === "NEXT_BUSINESS_DAY"
  ) {
    appliedRules.push(
      policy.businessDayHolidayMode === "EXCLUDE_PUBLIC_HOLIDAYS"
        ? "PUBLIC_HOLIDAYS_EXCLUDED_FROM_BUSINESS_DAYS"
        : "PUBLIC_HOLIDAYS_IGNORED_FOR_BUSINESS_DAYS",
    );
  }

  appliedRules.push(
    policy.approvalMode === "REQUIRED"
      ? "APPROVAL_REQUIRED"
      : "APPROVAL_NOT_REQUIRED",
  );

  return {
    status: "READY",
    targetHolidayDate,
    plannedLocalDate,
    plannedLocalTime: sendTimeLocal,
    timezone,
    leadTimeValue,
    leadTimeMode,
    weekendAdjustment: policy.weekendAdjustment,
    businessDayHolidayMode: policy.businessDayHolidayMode,
    approvalMode: policy.approvalMode,
    approvalRequired: policy.approvalMode === "REQUIRED",
    appliedRules,
  };
}

export function buildNotificationSchedulePreview(input: {
  targetHolidayDates: string[];
  policy: PolicyScheduleShape;
  publicHolidayDates?: ReadonlySet<string>;
}): NotificationSchedulePreview {
  const candidates = input.targetHolidayDates.map((targetHolidayDate) =>
    calculateNotificationSchedule({
      targetHolidayDate,
      policy: input.policy,
      publicHolidayDates: input.publicHolidayDates,
    }),
  );

  const reasons = [
    ...new Set(
      candidates.flatMap((candidate) =>
        candidate.status === "BLOCKED" ? candidate.reasons : [],
      ),
    ),
  ];

  return {
    status:
      candidates.length > 0 &&
      candidates.every((candidate) => candidate.status === "READY")
        ? "READY"
        : "BLOCKED",
    reasons:
      candidates.length === 0
        ? ["NO_MATCHING_HOLIDAY_DATES"]
        : reasons,
    candidates,
  };
}

export function scheduleCalendarRange(targetDates: string[]): {
  startDate: string;
  endDate: string;
} {
  const valid = targetDates.filter(isDateKey).sort();

  if (valid.length === 0) {
    throw new Error("Schedule calendar range requires at least one valid date.");
  }

  return {
    startDate: shiftDateKey(valid[0], -CALENDAR_LOOKBACK_DAYS),
    endDate: shiftDateKey(valid[valid.length - 1], CALENDAR_LOOKAHEAD_DAYS),
  };
}

export function shiftDateKey(date: string, days: number): string {
  const parsed = parseDateKey(date);
  if (!parsed) throw new Error(`Invalid date key: ${date}`);

  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function scheduleShape(
  value: VersionedSchedulePolicy,
): PolicyScheduleShape {
  return {
    leadTimeValue: value.leadTimeValue,
    leadTimeMode: value.leadTimeMode,
    sendTimeLocal: value.sendTimeLocal,
    timezone: value.timezone,
    weekendAdjustment: value.weekendAdjustment,
    businessDayHolidayMode: value.businessDayHolidayMode,
    approvalMode: value.approvalMode,
  };
}

function subtractBusinessDays(
  targetDate: string,
  count: number,
  publicHolidayDates: ReadonlySet<string>,
  holidayMode: NotificationBusinessDayHolidayModeValue,
): string {
  let cursor = targetDate;
  let remaining = count;
  let steps = 0;

  while (remaining > 0) {
    cursor = shiftDateKey(cursor, -1);
    steps += 1;

    if (
      isBusinessDay(cursor, publicHolidayDates, holidayMode)
    ) {
      remaining -= 1;
    }

    if (steps > MAX_CALENDAR_STEPS) {
      throw new Error(
        "Business-day subtraction exceeded the deterministic calendar safety bound.",
      );
    }
  }

  return cursor;
}

function moveToBusinessDay(
  sourceDate: string,
  direction: -1 | 1,
  publicHolidayDates: ReadonlySet<string>,
  holidayMode: NotificationBusinessDayHolidayModeValue,
): string {
  let cursor = sourceDate;

  for (let steps = 0; steps < MAX_CALENDAR_STEPS; steps += 1) {
    cursor = shiftDateKey(cursor, direction);

    if (isBusinessDay(cursor, publicHolidayDates, holidayMode)) {
      return cursor;
    }
  }

  throw new Error(
    "Business-day adjustment exceeded the deterministic calendar safety bound.",
  );
}

function isBusinessDay(
  date: string,
  publicHolidayDates: ReadonlySet<string>,
  holidayMode: NotificationBusinessDayHolidayModeValue,
): boolean {
  if (isWeekend(date)) return false;

  return !(
    holidayMode === "EXCLUDE_PUBLIC_HOLIDAYS" &&
    publicHolidayDates.has(date)
  );
}

function isWeekend(date: string): boolean {
  const parsed = parseDateKey(date);
  if (!parsed) return false;

  const day = parsed.getUTCDay();
  return day === 0 || day === 6;
}

function isDateKey(value: string): boolean {
  return parseDateKey(value) !== null;
}

function parseDateKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }

  return parsed;
}
