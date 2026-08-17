export type EffectiveSubscription = {
  isActive: boolean;
  effectiveFrom: Date | string | null;
  effectiveTo: Date | string | null;
};

export function normalizeClientName(value: string): string {
  return normalizeHumanKey(value);
}

export function normalizeServiceTeamName(value: string): string {
  return normalizeHumanKey(value);
}

export function normalizeContactEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateEffectiveWindow(input: {
  effectiveFrom: Date | string | null;
  effectiveTo: Date | string | null;
}): { ok: true } | { ok: false; reason: string } {
  const from = toDateKey(input.effectiveFrom);
  const to = toDateKey(input.effectiveTo);

  if (input.effectiveFrom !== null && !from) {
    return {
      ok: false,
      reason: "effectiveFrom must be a valid date.",
    };
  }

  if (input.effectiveTo !== null && !to) {
    return {
      ok: false,
      reason: "effectiveTo must be a valid date.",
    };
  }

  if (from && to && from > to) {
    return {
      ok: false,
      reason: "effectiveTo must be on or after effectiveFrom.",
    };
  }

  return { ok: true };
}

export function isSubscriptionEffectiveOn(
  subscription: EffectiveSubscription,
  date: Date | string,
): boolean {
  if (!subscription.isActive) return false;

  const target = toDateKey(date);
  if (!target) return false;

  const from = toDateKey(subscription.effectiveFrom);
  const to = toDateKey(subscription.effectiveTo);

  if (subscription.effectiveFrom !== null && !from) return false;
  if (subscription.effectiveTo !== null && !to) return false;

  if (from && target < from) return false;
  if (to && target > to) return false;

  return true;
}

function normalizeHumanKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toDateKey(value: Date | string | null): string | null {
  if (value === null) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== trimmed
  ) {
    return null;
  }

  return trimmed;
}
