"use client";

import { useEffect, useState } from "react";

import { JobEvidence, type Job } from "@/components/ph-dashboard/JobEvidence";
import { mountedPath } from "@/config/app";

const STATUSES = [
  "SENT",
  "FAILED",
  "RETRY_WAIT",
  "DUE",
  "PROCESSING",
  "PLANNED",
  "WAITING_APPROVAL",
  "CANCELLED",
] as const;

type Pagination = {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
};

type DeliveryResponse = {
  jobs: Job[];
  statusCounts: Record<string, number>;
  pagination: Pagination;
  error?: string;
};

const EMPTY_PAGINATION: Pagination = {
  page: 1,
  pageSize: 20,
  pageCount: 1,
  total: 0,
  from: 0,
  to: 0,
};

/**
 * Every committed job, across every occurrence, filtered for audit.
 *
 * The plan modal answers "what became of this holiday". This answers the questions that
 * cross holidays and are the ones actually asked after the fact: what failed, what did
 * this client get, what went out in December.
 */
export function DeliveryAudit() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [statusCounts, setStatusCounts] = useState<
    Record<string, number>
  >({});
  const [pagination, setPagination] =
    useState<Pagination>(EMPTY_PAGINATION);

  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [openJobId, setOpenJobId] = useState<string>();
  const [detail, setDetail] = useState<Job>();
  const [detailBusy, setDetailBusy] = useState(false);

  /*
   * The fetch lives inside the effect, and nothing is set before its first `await`.
   *
   * Both halves are load-bearing. A `useCallback` invoked from an effect is a synchronous
   * state write from an effect however carefully its body is arranged, which is a
   * cascade of renders on every keystroke.
   *
   * `loading` therefore covers the first load only; a refetch leaves the previous rows on
   * screen until the new ones arrive. That is the better behaviour anyway — the list
   * stops blanking between keystrokes in the search box.
   *
   * `cancelled` matters here more than it usually does: typing produces overlapping
   * requests, and without it the slowest response wins and the table shows results for a
   * query the box no longer contains.
   */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        if (statuses.length > 0) {
          params.set("status", statuses.join(","));
        }
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        params.set("page", String(page));

        const response = await fetch(
          mountedPath(
            `/api/notification-deliveries?${params.toString()}`,
          ),
          { cache: "no-store" },
        );
        const payload =
          (await response.json()) as DeliveryResponse;
        if (!response.ok) {
          throw new Error(
            payload.error ?? "Could not load deliveries.",
          );
        }

        if (cancelled) return;
        setJobs(payload.jobs);
        setStatusCounts(payload.statusCounts);
        setPagination(payload.pagination);
        setError(undefined);
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load deliveries.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [search, statuses, from, to, page]);

  /*
   * Changing a filter returns to page one.
   *
   * Without this, narrowing a filter while on page 4 shows an empty list of a result set
   * that has two pages — which reads as "nothing matches" and is the most common way a
   * filtered table lies.
   */
  function toggleStatus(status: string) {
    setPage(1);
    setStatuses((current) =>
      current.includes(status)
        ? current.filter((value) => value !== status)
        : [...current, status],
    );
  }

  async function openJob(jobId: string) {
    if (openJobId === jobId) {
      setOpenJobId(undefined);
      setDetail(undefined);
      return;
    }

    setOpenJobId(jobId);
    setDetail(undefined);
    setDetailBusy(true);

    try {
      const response = await fetch(
        mountedPath(
          `/api/notification-deliveries?jobId=${encodeURIComponent(jobId)}`,
        ),
        { cache: "no-store" },
      );
      const payload = (await response.json()) as DeliveryResponse;
      if (!response.ok) {
        throw new Error(
          payload.error ?? "Could not load the delivered email.",
        );
      }
      setDetail(payload.jobs[0]);
    } catch (detailError) {
      setError(
        detailError instanceof Error
          ? detailError.message
          : "Could not load the delivered email.",
      );
    } finally {
      setDetailBusy(false);
    }
  }

  return (
    <section className="ati-card delivery-audit">
      <div className="delivery-audit__filters">
        <input
          aria-label="Search holiday, client or service team"
          onChange={(event) => {
            setPage(1);
            setSearch(event.target.value);
          }}
          placeholder="Holiday, client or service team"
          type="search"
          value={search}
        />
        <label>
          <span>From</span>
          <input
            onChange={(event) => {
              setPage(1);
              setFrom(event.target.value);
            }}
            type="date"
            value={from}
          />
        </label>
        <label>
          <span>To</span>
          <input
            onChange={(event) => {
              setPage(1);
              setTo(event.target.value);
            }}
            type="date"
            value={to}
          />
        </label>
      </div>

      <p className="delivery-audit__hint">
        Dates filter the planned local send date, not the moment a message left. A job
        that never sent has no send time, and filtering on that would quietly hide every
        failure — which is usually what the question was about.
      </p>

      {/*
        * Counts ignore the status selection, so each chip shows what selecting it would
        * find rather than zero for everything unselected.
        */}
      <div className="delivery-audit__statuses">
        {STATUSES.map((status) => (
          <button
            className={
              statuses.includes(status)
                ? "delivery-audit__status delivery-audit__status--on"
                : "delivery-audit__status"
            }
            key={status}
            onClick={() => toggleStatus(status)}
            type="button"
          >
            {status.replace(/_/g, " ")}
            <span>{statusCounts[status] ?? 0}</span>
          </button>
        ))}
      </div>

      {error ? (
        <p className="form-notice form-notice--error">{error}</p>
      ) : null}

      {loading ? (
        <p className="committed-jobs__empty">Loading deliveries…</p>
      ) : jobs.length === 0 ? (
        <div className="notification-empty">
          <strong>No jobs match these filters</strong>
          <span>
            Jobs exist only after a notification plan is committed.
          </span>
        </div>
      ) : (
        <div className="committed-jobs">
          {jobs.map((job) => (
            <JobEvidence
              busy={detailBusy}
              detail={detail}
              job={job}
              key={job.id}
              onToggle={() => void openJob(job.id)}
              open={openJobId === job.id}
              showHoliday
            />
          ))}
        </div>
      )}

      <div className="delivery-audit__pagination">
        <span>
          {pagination.total === 0
            ? "No results"
            : `Showing ${pagination.from}–${pagination.to} of ${pagination.total}`}
        </span>
        <button
          className="ati-btn ati-btn--secondary"
          disabled={pagination.page <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          type="button"
        >
          Prev
        </button>
        <span>
          Page {pagination.page} of {pagination.pageCount}
        </span>
        <button
          className="ati-btn ati-btn--secondary"
          disabled={pagination.page >= pagination.pageCount}
          onClick={() => setPage((current) => current + 1)}
          type="button"
        >
          Next
        </button>
      </div>
    </section>
  );
}
