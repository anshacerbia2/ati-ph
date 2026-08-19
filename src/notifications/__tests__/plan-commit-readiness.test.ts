import { describe, expect, it } from "vitest";

import { notificationPlanCommitReadiness } from "@/notifications/plan-rules";

describe("notification plan commit readiness", () => {
  it("allows a single-date ready matched plan", () => {
    expect(
      notificationPlanCommitReadiness({
        committedAt: null,
        matched: 2,
        exceptions: 0,
        matchedSchedules: [
          { status: "READY", candidateCount: 1 },
          { status: "READY", candidateCount: 1 },
        ],
      }),
    ).toEqual({
      state: "READY",
      committedAt: null,
      reasons: [],
    });
  });

  it("blocks partial commit when matching exceptions exist", () => {
    const result = notificationPlanCommitReadiness({
      committedAt: null,
      matched: 2,
      exceptions: 1,
      matchedSchedules: [
        { status: "READY", candidateCount: 1 },
        { status: "READY", candidateCount: 1 },
      ],
    });

    expect(result.state).toBe("BLOCKED");
    if (result.state !== "BLOCKED") return;
    expect(result.reasons).toContain(
      "MATCHING_EXCEPTIONS_PRESENT",
    );
  });

  it("blocks multi-date execution semantics instead of guessing", () => {
    const result = notificationPlanCommitReadiness({
      committedAt: null,
      matched: 1,
      exceptions: 0,
      matchedSchedules: [
        { status: "READY", candidateCount: 2 },
      ],
    });

    expect(result.state).toBe("BLOCKED");
    if (result.state !== "BLOCKED") return;
    expect(result.reasons).toContain(
      "MULTI_DATE_NOTIFICATION_SEMANTICS_UNCONFIRMED",
    );
  });

  it("recognizes an already committed occurrence", () => {
    const committedAt = new Date(
      "2026-08-19T08:00:00.000Z",
    );

    expect(
      notificationPlanCommitReadiness({
        committedAt,
        matched: 1,
        exceptions: 0,
        matchedSchedules: [
          { status: "READY", candidateCount: 1 },
        ],
      }),
    ).toEqual({
      state: "COMMITTED",
      committedAt,
      reasons: [],
    });
  });
});
