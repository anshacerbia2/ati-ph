import { describe, expect, it } from "vitest";

import {
  resolveNotificationSchedulePolicy,
  type VersionedSchedulePolicy,
} from "@/notifications/schedule";

function schedule(
  version: number,
  leadTimeValue: number,
): VersionedSchedulePolicy {
  return {
    version,
    leadTimeValue,
    leadTimeMode: "CALENDAR_DAY",
    sendTimeLocal: "09:00",
    timezone: "Asia/Jakarta",
    weekendAdjustment: "NONE",
    businessDayHolidayMode: "UNCONFIRMED",
    approvalMode: "REQUIRED",
  };
}

describe("notification schedule source resolution", () => {
  it("uses the global version for inheriting clients", () => {
    const resolved = resolveNotificationSchedulePolicy({
      source: "GLOBAL",
      clientOverride: schedule(7, 99),
      globalPolicy: schedule(3, 5),
    });

    expect(resolved.status).toBe("RESOLVED");
    if (resolved.status !== "RESOLVED") return;

    expect(resolved.source).toBe("GLOBAL");
    expect(resolved.sourceVersion).toBe(3);
    expect(resolved.policy.leadTimeValue).toBe(5);
  });

  it("uses the full client override when explicitly selected", () => {
    const resolved = resolveNotificationSchedulePolicy({
      source: "CLIENT_OVERRIDE",
      clientOverride: schedule(7, 2),
      globalPolicy: schedule(3, 5),
    });

    expect(resolved.status).toBe("RESOLVED");
    if (resolved.status !== "RESOLVED") return;

    expect(resolved.source).toBe("CLIENT_OVERRIDE");
    expect(resolved.sourceVersion).toBe(7);
    expect(resolved.policy.leadTimeValue).toBe(2);
  });

  it("fails closed when a client inherits but no active global version exists", () => {
    expect(
      resolveNotificationSchedulePolicy({
        source: "GLOBAL",
        clientOverride: schedule(7, 2),
        globalPolicy: null,
      }),
    ).toEqual({
      status: "BLOCKED",
      source: "GLOBAL",
      sourceVersion: null,
      reasons: ["GLOBAL_SCHEDULE_UNAVAILABLE"],
    });
  });
});
