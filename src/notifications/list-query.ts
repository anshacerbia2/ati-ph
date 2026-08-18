export const NOTIFICATION_LIST_DEFAULT_PAGE_SIZE = 10;
export const NOTIFICATION_LIST_MAX_PAGE_SIZE = 50;

export type NotificationListQuery = {
  search: string;
  page: number;
  pageSize: number;
};

export function parseNotificationListQuery(input: {
  search?: string | null;
  page?: string | null;
  pageSize?: string | null;
}): NotificationListQuery {
  return {
    search: (input.search ?? "").trim().slice(0, 200),
    page: positiveInteger(input.page, 1),
    pageSize: Math.min(
      positiveInteger(input.pageSize, NOTIFICATION_LIST_DEFAULT_PAGE_SIZE),
      NOTIFICATION_LIST_MAX_PAGE_SIZE,
    ),
  };
}

function positiveInteger(
  value: string | null | undefined,
  fallback: number,
): number {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
