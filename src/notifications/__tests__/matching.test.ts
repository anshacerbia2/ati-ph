import { describe, expect, it } from "vitest";

import {
  evaluateSubscriptionMatch,
  type MatchingSubscriptionCandidate,
} from "@/notifications/matching";

function candidate(
  overrides: Partial<MatchingSubscriptionCandidate> = {},
): MatchingSubscriptionCandidate {
  return {
    id: "subscription-1",
    isActive: true,
    effectiveFrom: null,
    effectiveTo: null,
    client: { id: "client-1", name: "Client Alpha", isActive: true },
    serviceTeam: { id: "team-1", name: "Team Alpha", isActive: true },
    policy: {
      id: "policy-1",
      isActive: true,
      versions: [
        {
          id: "version-1",
          version: 1,
          isActive: true,
          holidayDayFilter: "WEEKDAY",
          leadTimeValue: null,
          leadTimeMode: null,
          sendTimeLocal: null,
          timezone: null,
          weekendAdjustment: "UNCONFIRMED",
          businessDayHolidayMode: "UNCONFIRMED",
          approvalMode: "UNCONFIRMED",
        },
      ],
    },
    recipients: [
      {
        isActive: true,
        recipientType: "TO",
        contact: {
          id: "contact-1",
          displayName: "Owner",
          email: "owner@example.com",
          isActive: true,
        },
      },
    ],
    ...overrides,
  };
}

describe("deterministic notification matching", () => {
  it("matches effective weekday dates and preserves schedule incompleteness", () => {
    const result = evaluateSubscriptionMatch(candidate(), [
      { date: "2027-01-04", dayType: "WEEKDAY" },
      { date: "2027-01-09", dayType: "WEEKEND" },
    ]);

    expect(result.status).toBe("MATCHED");
    expect(result.matchingDates).toEqual(["2027-01-04"]);
    expect(result.to.map((recipient) => recipient.email)).toEqual(["owner@example.com"]);
    expect(result.policy?.scheduleReady).toBe(false);
    expect(result.policy?.scheduleIssues).toContain("LEAD_TIME_UNCONFIGURED");
  });

  it("excludes inactive routing", () => {
    const result = evaluateSubscriptionMatch(candidate({ isActive: false }), [
      { date: "2027-01-04", dayType: "WEEKDAY" },
    ]);
    expect(result.status).toBe("EXCLUDED");
    expect(result.code).toBe("INACTIVE_ROUTING");
  });

  it("honors the subscription effective window", () => {
    const result = evaluateSubscriptionMatch(
      candidate({ effectiveFrom: "2027-02-01", effectiveTo: null }),
      [{ date: "2027-01-04", dayType: "WEEKDAY" }],
    );
    expect(result.status).toBe("EXCLUDED");
    expect(result.code).toBe("OUTSIDE_EFFECTIVE_WINDOW");
  });

  it("excludes a holiday when no occurrence date matches the day filter", () => {
    const result = evaluateSubscriptionMatch(candidate(), [
      { date: "2027-01-09", dayType: "WEEKEND" },
    ]);
    expect(result.status).toBe("EXCLUDED");
    expect(result.code).toBe("DAY_FILTER_NO_MATCH");
  });

  it("reports a missing active policy version", () => {
    const result = evaluateSubscriptionMatch(
      candidate({ policy: { id: "policy-1", isActive: true, versions: [] } }),
      [{ date: "2027-01-04", dayType: "WEEKDAY" }],
    );
    expect(result.status).toBe("EXCEPTION");
    expect(result.code).toBe("NO_ACTIVE_POLICY_VERSION");
  });

  it("reports missing TO recipients instead of silently creating work", () => {
    const result = evaluateSubscriptionMatch(
      candidate({
        recipients: [
          {
            isActive: true,
            recipientType: "CC",
            contact: {
              id: "contact-2",
              displayName: null,
              email: "cc@example.com",
              isActive: true,
            },
          },
        ],
      }),
      [{ date: "2027-01-04", dayType: "WEEKDAY" }],
    );
    expect(result.status).toBe("EXCEPTION");
    expect(result.code).toBe("NO_TO_RECIPIENT");
    expect(result.cc.map((recipient) => recipient.email)).toEqual(["cc@example.com"]);
  });
});
