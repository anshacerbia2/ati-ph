import type { NotificationJobStatus } from "@prisma/client";

import {
  NOTIFICATION_LIST_DEFAULT_PAGE_SIZE,
  NOTIFICATION_LIST_MAX_PAGE_SIZE,
} from "@/notifications/list-query";

export const NOTIFICATION_JOB_STATUSES = [
  "WAITING_APPROVAL",
  "PLANNED",
  "DUE",
  "PROCESSING",
  "RETRY_WAIT",
  "SENT",
  "FAILED",
  "CANCELLED",
] as const satisfies readonly NotificationJobStatus[];

export type DeliveryListQuery = {
  search: string;
  statuses: NotificationJobStatus[];
  /** Inclusive date keys, `YYYY-MM-DD`, against the planned local send date. */
  from: string | null;
  to: string | null;
  page: number;
  pageSize: number;
};

/**
 * Parses the delivery filters from a query string.
 *
 * ## Why the date filter is on the planned local date
 *
 * The obvious column is `sentAt`, and it is the wrong one: a job that never sent has
 * none, so any range filter built on it silently drops the failures — which is what an
 * auditor came to find. `plannedLocalDate` exists on every job from the moment it is
 * committed, and it is the date a person means when they say "the December run".
 *
 * ## Why unknown statuses are dropped rather than rejected
 *
 * The status list arrives from checkboxes in a URL. A stale bookmark naming a status
 * that no longer exists should show the rest, not an error page — the request is still
 * answerable, and refusing it teaches people not to share links.
 */
export function parseDeliveryListQuery(input: {
  search?: string | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
  page?: string | null;
  pageSize?: string | null;
}): DeliveryListQuery {
  const requested = (input.status ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  const statuses = NOTIFICATION_JOB_STATUSES.filter((status) =>
    requested.includes(status),
  );

  return {
    search: (input.search ?? "").trim().slice(0, 200),
    statuses,
    from: dateKey(input.from),
    to: dateKey(input.to),
    page: positiveInteger(input.page, 1),
    pageSize: Math.min(
      positiveInteger(
        input.pageSize,
        NOTIFICATION_LIST_DEFAULT_PAGE_SIZE * 2,
      ),
      NOTIFICATION_LIST_MAX_PAGE_SIZE,
    ),
  };
}

/**
 * A calendar date, or null.
 *
 * Validated by structure *and* by round-trip, because `2026-02-31` parses to 3 March in
 * every JavaScript date constructor. A filter that silently shifts the day a user typed
 * is worse than one that ignores it.
 */
function dateKey(value: string | null | undefined): string | null {
  const candidate = (value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;

  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString().slice(0, 10) === candidate
    ? candidate
    : null;
}

function positiveInteger(
  value: string | null | undefined,
  fallback: number,
): number {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}
