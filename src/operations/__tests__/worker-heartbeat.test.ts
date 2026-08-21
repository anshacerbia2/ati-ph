import { describe, expect, it } from "vitest";

import { evaluateWorkerHeartbeat } from "@/operations/readiness";

const NOW = new Date("2026-08-21T10:00:00.000Z");
const MINUTE = 60_000;

function at(minutesAgo: number): Date {
  return new Date(NOW.getTime() - minutesAgo * MINUTE);
}

describe("evaluateWorkerHeartbeat", () => {
  it("reports a recent cycle as healthy", () => {
    const result = evaluateWorkerHeartbeat({
      workerEnabled: true,
      now: NOW,
      pollIntervalMs: 60_000,
      lastSuccessfulAt: at(1),
    });

    expect(result.state).toBe("HEALTHY");
    expect(result.ageMs).toBe(MINUTE);
    // Seconds below 90, so a one-minute-old cycle reads "60s" rather than "1 min".
    expect(result.summary).toContain("60s");
  });

  it("reports a worker that has stopped as late, and says by how much", () => {
    /*
     * The state the panel could not previously express. It printed a timestamp and left
     * the reader to work out whether it was normal — which needs the poll interval, and
     * that was not on the screen.
     */
    const result = evaluateWorkerHeartbeat({
      workerEnabled: true,
      now: NOW,
      pollIntervalMs: 60_000,
      lastSuccessfulAt: at(30),
    });

    expect(result.state).toBe("LATE");
    expect(result.summary).toContain("30 min");
    expect(result.summary).toContain("3 min");
  });

  it("tolerates three missed cycles before calling a worker late", () => {
    /*
     * One missed cycle is a slow query or a restart. The boundary is asserted from both
     * sides so a change to it is a decision rather than a side effect.
     */
    const pollIntervalMs = 120_000;
    const maximumAgeMs = pollIntervalMs * 3;

    const inside = evaluateWorkerHeartbeat({
      workerEnabled: true,
      now: NOW,
      pollIntervalMs,
      lastSuccessfulAt: new Date(NOW.getTime() - maximumAgeMs),
    });
    const outside = evaluateWorkerHeartbeat({
      workerEnabled: true,
      now: NOW,
      pollIntervalMs,
      lastSuccessfulAt: new Date(NOW.getTime() - maximumAgeMs - 1),
    });

    expect(inside.state).toBe("HEALTHY");
    expect(outside.state).toBe("LATE");
    expect(inside.maximumAgeMs).toBe(maximumAgeMs);
  });

  it("floors the allowance at three minutes for a fast poll interval", () => {
    /*
     * Without the floor, a five-second interval would call a worker late after fifteen
     * seconds and the dashboard would cry wolf.
     */
    const result = evaluateWorkerHeartbeat({
      workerEnabled: true,
      now: NOW,
      pollIntervalMs: 5_000,
      lastSuccessfulAt: at(2),
    });

    expect(result.maximumAgeMs).toBe(180_000);
    expect(result.state).toBe("HEALTHY");
  });

  it("distinguishes a worker that never ran from one that fell behind", () => {
    const result = evaluateWorkerHeartbeat({
      workerEnabled: true,
      now: NOW,
      pollIntervalMs: 60_000,
      lastSuccessfulAt: null,
    });

    expect(result.state).toBe("NEVER_RUN");
    expect(result.ageMs).toBeNull();
  });

  it("reports a configured-off worker as disabled, not as late", () => {
    /*
     * The distinction the health endpoint's `evaluateWorkerReadiness` cannot make for a
     * dashboard: a worker that is off on purpose is not a fault, and an old heartbeat
     * from before it was turned off is not evidence of one.
     */
    const result = evaluateWorkerHeartbeat({
      workerEnabled: false,
      now: NOW,
      pollIntervalMs: 60_000,
      lastSuccessfulAt: at(6_000),
    });

    expect(result.state).toBe("DISABLED");
    expect(result.summary).toContain("Disabled by configuration");
  });

  it("refuses a poll interval the schema would not have allowed", () => {
    expect(() =>
      evaluateWorkerHeartbeat({
        workerEnabled: true,
        now: NOW,
        pollIntervalMs: 1_000,
        lastSuccessfulAt: NOW,
      }),
    ).toThrow("at least 5000ms");
  });
});
