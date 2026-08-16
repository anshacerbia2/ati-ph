import { mountedPath } from "@/config/app";
import type { PaginationMeta } from "@/lib/pagination";

export function DataPagination({
  label,
  pagination,
}: {
  label: string;
  pagination: PaginationMeta;
}) {
  if (pagination.pageCount <= 1) {
    return null;
  }

  return (
    <nav
      aria-label={`${label} pagination`}
      className="data-pagination"
    >
      <span>
        {label} {pagination.from}-{pagination.to} of{" "}
        {pagination.total}
      </span>

      <div className="data-pagination__actions">
        {pagination.previousHref ? (
          <a
            className="ati-btn ati-btn--compact ati-btn--subtle"
            href={mountedPath(pagination.previousHref)}
          >
            Previous
          </a>
        ) : (
          <button
            className="ati-btn ati-btn--compact ati-btn--subtle"
            disabled
            type="button"
          >
            Previous
          </button>
        )}

        <span>
          Page {pagination.page} of {pagination.pageCount}
        </span>

        {pagination.nextHref ? (
          <a
            className="ati-btn ati-btn--compact ati-btn--subtle"
            href={mountedPath(pagination.nextHref)}
          >
            Next
          </a>
        ) : (
          <button
            className="ati-btn ati-btn--compact ati-btn--subtle"
            disabled
            type="button"
          >
            Next
          </button>
        )}
      </div>
    </nav>
  );
}
