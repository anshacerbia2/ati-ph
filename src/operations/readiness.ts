export type WorkerHeartbeatState =
  | "DISABLED"
  | "NEVER_RUN"
  | "HEALTHY"
  | "LATE";

export type WorkerHeartbeat = {
  state: WorkerHeartbeatState;
  summary: string;
  ageMs: number | null;
  maximumAgeMs: number;
  lastSuccessfulAt: Date | null;
};

/**
 * Whether the worker is doing its job, for the operations screen.
 *
 * ## Why this is not `evaluateWorkerReadiness`
 *
 * That one answers "is the deployment ready", and its answer is *not required* whenever
 * trusted automation is off — correct for a health endpoint, and wrong for a person
 * looking at a dashboard. The worker still schedules, recovers leases, promotes retries
 * and delivers with trusted automation off; only auto-committing plans is disabled. A
 * screen that reported "ready" while the worker had been dead for a day would be
 * accurate and useless.
 *
 * So this keys on whether the worker is *supposed to be running* — `NOTIFICATION_WORKER_ENABLED`
 * — which is now a configured fact rather than something inferred from what happens to be
 * running.
 *
 * ## Why a verdict rather than a timestamp
 *
 * The panel showed `Last success: 4:25:51 AM` and left the reader to work out whether
 * that was normal. Answering that requires knowing the poll interval, which is not on the
 * screen. A stale worker and a healthy one looked identical.
 */
export function evaluateWorkerHeartbeat(
  input: {
    workerEnabled: boolean;
    now: Date;
    pollIntervalMs: number;
    lastSuccessfulAt: Date | null;
  },
): WorkerHeartbeat {
  if (
    !Number.isInteger(input.pollIntervalMs) ||
    input.pollIntervalMs < 5_000
  ) {
    throw new Error(
      "Worker heartbeat poll interval must be at least 5000ms.",
    );
  }

  /*
   * Three cycles, floored at three minutes. One missed cycle is a slow query or a
   * container restart; three is a worker that is not coming back on its own. The floor
   * stops a short poll interval from making the dashboard cry wolf.
   */
  const maximumAgeMs = Math.max(
    input.pollIntervalMs * 3,
    180_000,
  );

  if (!input.workerEnabled) {
    return {
      state: "DISABLED",
      summary:
        "Disabled by configuration. Nothing is being scheduled, claimed or delivered.",
      ageMs: null,
      maximumAgeMs,
      lastSuccessfulAt: input.lastSuccessfulAt,
    };
  }

  if (!input.lastSuccessfulAt) {
    return {
      state: "NEVER_RUN",
      summary:
        "Enabled, but no successful cycle has ever been recorded.",
      ageMs: null,
      maximumAgeMs,
      lastSuccessfulAt: null,
    };
  }

  const ageMs =
    input.now.getTime() -
    input.lastSuccessfulAt.getTime();

  if (ageMs > maximumAgeMs) {
    return {
      state: "LATE",
      summary: `No successful cycle for ${formatDuration(ageMs)}, which is over the ${formatDuration(maximumAgeMs)} this deployment allows.`,
      ageMs,
      maximumAgeMs,
      lastSuccessfulAt: input.lastSuccessfulAt,
    };
  }

  return {
    state: "HEALTHY",
    summary: `Last successful cycle ${formatDuration(ageMs)} ago.`,
    ageMs,
    maximumAgeMs,
    lastSuccessfulAt: input.lastSuccessfulAt,
  };
}

/** Whole units only. "2 minutes" reads; "2.4333 minutes" is noise on a dashboard. */
function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1_000));
  if (seconds < 90) return `${seconds}s`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;

  return `${Math.round(hours / 24)}d`;
}

export type WorkerReadiness = {
  required: boolean;
  ready: boolean;
  stale: boolean;
  maximumAgeMs: number;
  lastSuccessfulAt: Date | null;
  reason: string | null;
};

export function evaluateWorkerReadiness(
  input: {
    trustedAutomationEnabled: boolean;
    now: Date;
    pollIntervalMs: number;
    lastSuccessfulAt: Date | null;
  },
): WorkerReadiness {
  if (
    !Number.isInteger(input.pollIntervalMs) ||
    input.pollIntervalMs < 5_000
  ) {
    throw new Error(
      "Worker readiness poll interval must be at least 5000ms.",
    );
  }

  const maximumAgeMs = Math.max(
    input.pollIntervalMs * 3,
    180_000,
  );

  if (!input.trustedAutomationEnabled) {
    return {
      required: false,
      ready: true,
      stale: false,
      maximumAgeMs,
      lastSuccessfulAt:
        input.lastSuccessfulAt,
      reason: null,
    };
  }

  if (!input.lastSuccessfulAt) {
    return {
      required: true,
      ready: false,
      stale: true,
      maximumAgeMs,
      lastSuccessfulAt: null,
      reason:
        "Trusted automation is enabled but no successful worker heartbeat exists.",
    };
  }

  const ageMs =
    input.now.getTime() -
    input.lastSuccessfulAt.getTime();
  const stale = ageMs > maximumAgeMs;

  return {
    required: true,
    ready: !stale,
    stale,
    maximumAgeMs,
    lastSuccessfulAt:
      input.lastSuccessfulAt,
    reason: stale
      ? "Trusted automation worker heartbeat is stale."
      : null,
  };
}
