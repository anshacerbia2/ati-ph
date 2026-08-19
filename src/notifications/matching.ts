import { isSubscriptionEffectiveOn } from "@/clients/routing";
import {
  type HolidayDayFilterValue,
  type NotificationApprovalModeValue,
  type NotificationBusinessDayHolidayModeValue,
  type NotificationLeadTimeModeValue,
  type NotificationScheduleSourceValue,
  type NotificationWeekendAdjustmentValue,
} from "@/notifications/policy-rules";

export type MatchingOccurrenceDate = {
  date: string;
  dayType: "WEEKDAY" | "WEEKEND";
};

export type MatchingPolicyVersion = {
  id: string;
  version: number;
  isActive: boolean;
  holidayDayFilter: HolidayDayFilterValue;
  scheduleSource: NotificationScheduleSourceValue;
  leadTimeValue: number | null;
  leadTimeMode: NotificationLeadTimeModeValue | null;
  sendTimeLocal: string | null;
  timezone: string | null;
  weekendAdjustment: NotificationWeekendAdjustmentValue;
  businessDayHolidayMode: NotificationBusinessDayHolidayModeValue;
  approvalMode: NotificationApprovalModeValue;
};

export type MatchingSubscriptionCandidate = {
  id: string;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  client: { id: string; name: string; isActive: boolean };
  serviceTeam: { id: string; name: string; isActive: boolean };
  policy: {
    id: string;
    isActive: boolean;
    versions: MatchingPolicyVersion[];
  } | null;
  recipients: Array<{
    isActive: boolean;
    recipientType: "TO" | "CC";
    contact: {
      id: string;
      displayName: string | null;
      email: string;
      isActive: boolean;
    };
  }>;
};

export type MatchingRecipient = {
  contactId: string;
  displayName: string | null;
  email: string;
};

export type MatchingResult = {
  subscriptionId: string;
  clientId: string;
  clientName: string;
  serviceTeamId: string;
  serviceTeamName: string;
  status: "MATCHED" | "EXCLUDED" | "EXCEPTION";
  code: string;
  reason: string;
  matchingDates: string[];
  policy: {
    id: string;
    versionId: string;
    version: number;
    holidayDayFilter: HolidayDayFilterValue;
    scheduleSource: NotificationScheduleSourceValue;
    leadTimeValue: number | null;
    leadTimeMode: NotificationLeadTimeModeValue | null;
    sendTimeLocal: string | null;
    timezone: string | null;
    weekendAdjustment: NotificationWeekendAdjustmentValue;
    businessDayHolidayMode: NotificationBusinessDayHolidayModeValue;
    approvalMode: NotificationApprovalModeValue;
  } | null;
  to: MatchingRecipient[];
  cc: MatchingRecipient[];
};

export function evaluateSubscriptionMatch(
  candidate: MatchingSubscriptionCandidate,
  occurrenceDates: MatchingOccurrenceDate[],
): MatchingResult {
  const base = {
    subscriptionId: candidate.id,
    clientId: candidate.client.id,
    clientName: candidate.client.name,
    serviceTeamId: candidate.serviceTeam.id,
    serviceTeamName: candidate.serviceTeam.name,
    matchingDates: [] as string[],
    policy: null,
    to: [] as MatchingRecipient[],
    cc: [] as MatchingRecipient[],
  };

  if (!candidate.client.isActive || !candidate.serviceTeam.isActive || !candidate.isActive) {
    return {
      ...base,
      status: "EXCLUDED",
      code: "INACTIVE_ROUTING",
      reason: "Client, service team, or subscription is inactive.",
    };
  }

  const effectiveDates = occurrenceDates.filter((item) =>
    isSubscriptionEffectiveOn(
      {
        isActive: true,
        effectiveFrom: candidate.effectiveFrom,
        effectiveTo: candidate.effectiveTo,
      },
      item.date,
    ),
  );

  if (effectiveDates.length === 0) {
    return {
      ...base,
      status: "EXCLUDED",
      code: "OUTSIDE_EFFECTIVE_WINDOW",
      reason: "No holiday occurrence date falls inside the subscription effective window.",
    };
  }

  if (!candidate.policy || !candidate.policy.isActive) {
    return {
      ...base,
      status: "EXCEPTION",
      code: "NO_ACTIVE_POLICY",
      reason: "The subscription has no active notification policy.",
    };
  }

  const activeVersions = candidate.policy.versions.filter((version) => version.isActive);
  if (activeVersions.length === 0) {
    return {
      ...base,
      status: "EXCEPTION",
      code: "NO_ACTIVE_POLICY_VERSION",
      reason: "The notification policy has no active version.",
    };
  }
  if (activeVersions.length > 1) {
    return {
      ...base,
      status: "EXCEPTION",
      code: "AMBIGUOUS_POLICY_VERSION",
      reason: "More than one active notification policy version applies.",
    };
  }

  const version = activeVersions[0];
  const matchingDates = effectiveDates
    .filter((item) => dayFilterMatches(version.holidayDayFilter, item.dayType))
    .map((item) => item.date);
  const policy = {
    id: candidate.policy.id,
    versionId: version.id,
    version: version.version,
    holidayDayFilter: version.holidayDayFilter,
    scheduleSource: version.scheduleSource,
    leadTimeValue: version.leadTimeValue,
    leadTimeMode: version.leadTimeMode,
    sendTimeLocal: version.sendTimeLocal,
    timezone: version.timezone,
    weekendAdjustment: version.weekendAdjustment,
    businessDayHolidayMode: version.businessDayHolidayMode,
    approvalMode: version.approvalMode,
  };

  if (matchingDates.length === 0) {
    return {
      ...base,
      status: "EXCLUDED",
      code: "DAY_FILTER_NO_MATCH",
      reason: "No effective holiday occurrence date matches the policy day filter.",
      policy,
    };
  }

  const activeRecipients = candidate.recipients
    .filter((recipient) => recipient.isActive && recipient.contact.isActive)
    .map((recipient) => ({
      recipientType: recipient.recipientType,
      contactId: recipient.contact.id,
      displayName: recipient.contact.displayName,
      email: recipient.contact.email,
    }))
    .sort((left, right) => left.email.localeCompare(right.email));

  const to = activeRecipients
    .filter((recipient) => recipient.recipientType === "TO")
    .map((recipient) => ({
      contactId: recipient.contactId,
      displayName: recipient.displayName,
      email: recipient.email,
    }));
  const cc = activeRecipients
    .filter((recipient) => recipient.recipientType === "CC")
    .map((recipient) => ({
      contactId: recipient.contactId,
      displayName: recipient.displayName,
      email: recipient.email,
    }));

  if (to.length === 0) {
    return {
      ...base,
      status: "EXCEPTION",
      code: "NO_TO_RECIPIENT",
      reason: "The matched subscription has no active TO recipient.",
      matchingDates,
      policy,
      cc,
    };
  }

  return {
    ...base,
    status: "MATCHED",
    code: "ROUTING_MATCH",
    reason: "Subscription, day filter, and recipients matched.",
    matchingDates,
    policy,
    to,
    cc,
  };
}

export function dayFilterMatches(
  filter: HolidayDayFilterValue,
  dayType: MatchingOccurrenceDate["dayType"],
): boolean {
  return filter === "ALL" || filter === dayType;
}
