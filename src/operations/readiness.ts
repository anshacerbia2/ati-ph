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
