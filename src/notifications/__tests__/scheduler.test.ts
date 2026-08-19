import { describe, expect, it } from "vitest";

import {
  initialNotificationJobStatus,
} from "@/notifications/job-rules";
import {
  notificationJobIsDue,
} from "@/notifications/scheduler";

describe("notification scheduler boundaries", () => {
  const now = new Date("2026-12-31T22:00:00.000Z");

  it("puts approval-required jobs behind an approval gate", () => {
    expect(initialNotificationJobStatus(true)).toBe(
      "WAITING_APPROVAL",
    );
  });

  it("makes no-approval jobs schedulable", () => {
    expect(initialNotificationJobStatus(false)).toBe(
      "PLANNED",
    );
  });

  it("marks only PLANNED jobs at or before scheduledAt as due", () => {
    expect(
      notificationJobIsDue(
        {
          status: "PLANNED",
          scheduledAt: new Date(
            "2026-12-31T22:00:00.000Z",
          ),
        },
        now,
      ),
    ).toBe(true);

    expect(
      notificationJobIsDue(
        {
          status: "WAITING_APPROVAL",
          scheduledAt: new Date(
            "2026-12-31T21:00:00.000Z",
          ),
        },
        now,
      ),
    ).toBe(false);

    expect(
      notificationJobIsDue(
        {
          status: "PLANNED",
          scheduledAt: new Date(
            "2026-12-31T23:00:00.000Z",
          ),
        },
        now,
      ),
    ).toBe(false);
  });
});
