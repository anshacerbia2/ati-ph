export const DEFAULT_PAGE_SIZE = 10;

export type SearchParamValue = string | string[] | undefined;

export type SearchParamsRecord = Record<string, SearchParamValue>;

export type PaginationMeta = {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  offset: number;
  from: number;
  to: number;
  previousHref: string | null;
  nextHref: string | null;
};

export function parsePageParam(value: SearchParamValue): number {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw) {
    return 1;
  }

  const parsed = Number.parseInt(raw, 10);

  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : 1;
}

export function createPagination({
  total,
  requestedPage,
  pathname,
  pageParam,
  searchParams,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  total: number;
  requestedPage: number;
  pathname: string;
  pageParam: string;
  searchParams: SearchParamsRecord;
  pageSize?: number;
}): PaginationMeta {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error("Pagination total must be a non-negative integer.");
  }

  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
    throw new Error("Pagination pageSize must be a positive integer.");
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(
    Math.max(1, requestedPage),
    pageCount,
  );
  const offset = (page - 1) * pageSize;

  return {
    page,
    pageSize,
    pageCount,
    total,
    offset,
    from: total === 0 ? 0 : offset + 1,
    to: total === 0 ? 0 : Math.min(offset + pageSize, total),
    previousHref:
      page > 1
        ? buildPageHref(
            pathname,
            searchParams,
            pageParam,
            page - 1,
          )
        : null,
    nextHref:
      page < pageCount
        ? buildPageHref(
            pathname,
            searchParams,
            pageParam,
            page + 1,
          )
        : null,
  };
}

export function buildPageHref(
  pathname: string,
  searchParams: SearchParamsRecord,
  pageParam: string,
  page: number,
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === pageParam || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
      continue;
    }

    params.set(key, value);
  }

  if (page > 1) {
    params.set(pageParam, String(page));
  }

  const query = params.toString();

  return query ? `${pathname}?${query}` : pathname;
}
