export type HolidayDayFilterValue = "WEEKDAY" | "WEEKEND" | "ALL";
export type NotificationLeadTimeModeValue = "CALENDAR_DAY" | "BUSINESS_DAY";
export type NotificationWeekendAdjustmentValue =
  | "UNCONFIRMED"
  | "NONE"
  | "PREVIOUS_BUSINESS_DAY"
  | "NEXT_BUSINESS_DAY";
export type NotificationBusinessDayHolidayModeValue =
  | "UNCONFIRMED"
  | "EXCLUDE_PUBLIC_HOLIDAYS"
  | "IGNORE_PUBLIC_HOLIDAYS";
export type NotificationApprovalModeValue =
  | "UNCONFIRMED"
  | "REQUIRED"
  | "NOT_REQUIRED";
export type NotificationScheduleSourceValue =
  | "GLOBAL"
  | "CLIENT_OVERRIDE";

export type PolicyScheduleShape = {
  leadTimeValue: number | null;
  leadTimeMode: NotificationLeadTimeModeValue | null;
  sendTimeLocal: string | null;
  timezone: string | null;
  weekendAdjustment: NotificationWeekendAdjustmentValue;
  businessDayHolidayMode: NotificationBusinessDayHolidayModeValue;
  approvalMode: NotificationApprovalModeValue;
};

export function policyScheduleIssues(policy: PolicyScheduleShape): string[] {
  const issues: string[] = [];

  if (policy.leadTimeValue === null || policy.leadTimeMode === null) {
    issues.push("LEAD_TIME_UNCONFIGURED");
  }

  if (!policy.sendTimeLocal) {
    issues.push("SEND_TIME_UNCONFIGURED");
  } else if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(policy.sendTimeLocal)) {
    issues.push("SEND_TIME_INVALID");
  }

  if (!policy.timezone) {
    issues.push("TIMEZONE_UNCONFIGURED");
  } else if (!isValidTimeZone(policy.timezone)) {
    issues.push("TIMEZONE_INVALID");
  }

  if (policy.weekendAdjustment === "UNCONFIRMED") {
    issues.push("WEEKEND_ADJUSTMENT_UNCONFIRMED");
  }

  if (policy.approvalMode === "UNCONFIRMED") {
    issues.push("APPROVAL_MODE_UNCONFIRMED");
  }

  const usesBusinessDayMovement =
    policy.leadTimeMode === "BUSINESS_DAY" ||
    policy.weekendAdjustment === "PREVIOUS_BUSINESS_DAY" ||
    policy.weekendAdjustment === "NEXT_BUSINESS_DAY";

  if (
    usesBusinessDayMovement &&
    policy.businessDayHolidayMode === "UNCONFIRMED"
  ) {
    issues.push("BUSINESS_DAY_HOLIDAY_RULE_UNCONFIRMED");
  }

  return issues;
}

export function isPolicyScheduleReady(policy: PolicyScheduleShape): boolean {
  return policyScheduleIssues(policy).length === 0;
}

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
