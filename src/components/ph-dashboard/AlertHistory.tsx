"use client";

import { useEffect, useState } from "react";

import { mountedPath } from "@/config/app";

const STATUSES = ["OPEN", "RESOLVED"] as const;
const TYPES = [
  "PLANNING_BLOCKED",
  "ZERO_RECIPIENT",
  "SCHEDULER_LAG",
  "DELIVERY_FAILURE",
] as const;

type Alert = {
  id: string;
  alertKey: string;
  type: string;
  severity: string;
  status: string;
  summary: string;
  details: unknown;
  holidayOccurrenceId: string | null;
  notificationJobId: string | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
  resolvedAt: string | null;
};

type Response_ = {
  alerts: Alert[];
  facets: {
    byStatus: Record<string, number>;
    byType: Record<string, number>;
  };
  pagination: {
    page: number;
    pageCount: number;
    total: number;
    from: number;
    to: number;
  };
  error?: string;
};

function when(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

/**
 * How long a condition has been present, from its two timestamps.
 *
 * `alertKey` is unique, so a recurrence updates the row instead of adding one. That
 * makes this a duration and not a count — and saying "since" rather than "3 times" is
 * the difference between reading the data and inventing it.
 */
function spanned(first: string, last: string): string {
  const ms = new Date(last).getTime() - new Date(first).getTime();
  if (ms < 60_000) return "first and last detection within a minute";

  const hours = Math.round(ms / 3_600_000);
  if (hours < 48) {
    return `recurring across ${Math.max(1, hours)}h`;
  }
  return `recurring across ${Math.round(hours / 24)}d`;
}

export function AlertHistory() {
  const [data, setData] = useState<Response_>();
  const [statuses, setStatuses] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string>();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const params = new URLSearchParams();
        if (statuses.length > 0) {
          params.set("status", statuses.join(","));
        }
        if (types.length > 0) params.set("type", types.join(","));
        params.set("page", String(page));

        const response = await fetch(
          mountedPath(
            `/api/notification-operations/alerts?${params.toString()}`,
          ),
          { cache: "no-store" },
        );
        const payload = (await response.json()) as Response_;
        if (!response.ok) {
          throw new Error(
            payload.error ?? "Could not load alert history.",
          );
        }
        if (cancelled) return;
        setData(payload);
        setError(undefined);
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load alert history.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [statuses, types, page]);

  function toggle(
    value: string,
    current: string[],
    set: (next: string[]) => void,
  ) {
    setPage(1);
    set(
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    );
  }

  return (
    <div className="alert-history">
      <div className="committed-jobs__header">
        <strong>Alert history</strong>
        <span>
          Resolved alerts included. A recurring condition reuses its row, so the two
          timestamps are a span rather than a count.
        </span>
      </div>

      <div className="delivery-audit__statuses">
        {STATUSES.map((status) => (
          <button
            className={
              statuses.includes(status)
                ? "delivery-audit__status delivery-audit__status--on"
                : "delivery-audit__status"
            }
            key={status}
            onClick={() => toggle(status, statuses, setStatuses)}
            type="button"
          >
            {status}
            <span>{data?.facets.byStatus[status] ?? 0}</span>
          </button>
        ))}
        {TYPES.map((type) => (
          <button
            className={
              types.includes(type)
                ? "delivery-audit__status delivery-audit__status--on"
                : "delivery-audit__status"
            }
            key={type}
            onClick={() => toggle(type, types, setTypes)}
            type="button"
          >
            {type.replace(/_/g, " ")}
            <span>{data?.facets.byType[type] ?? 0}</span>
          </button>
        ))}
      </div>

      {error ? (
        <p className="form-notice form-notice--error">{error}</p>
      ) : null}

      {loading ? (
        <p className="committed-jobs__empty">Loading alert history…</p>
      ) : !data || data.alerts.length === 0 ? (
        <div className="notification-empty">
          <strong>No alerts recorded</strong>
          <span>
            Scheduler lag, delivery failure, zero-recipient and planning-blocked
            conditions are recorded here whether or not they are still open.
          </span>
        </div>
      ) : (
        <div className="committed-jobs">
          {data.alerts.map((alert) => (
            <article className="committed-job" key={alert.id}>
              <div className="committed-job__row">
                <span
                  className={
                    alert.status === "OPEN"
                      ? "committed-job__status committed-job__status--bad"
                      : "committed-job__status committed-job__status--ok"
                  }
                >
                  {alert.status}
                </span>
                <div className="committed-job__identity">
                  <strong>{alert.type.replace(/_/g, " ")}</strong>
                  <span>{alert.severity}</span>
                </div>
                <div className="committed-job__facts">
                  <span>{alert.summary}</span>
                  <span>
                    First {when(alert.firstDetectedAt)} · last{" "}
                    {when(alert.lastDetectedAt)}
                  </span>
                  <span>
                    {spanned(
                      alert.firstDetectedAt,
                      alert.lastDetectedAt,
                    )}
                    {alert.resolvedAt
                      ? ` · resolved ${when(alert.resolvedAt)}`
                      : ""}
                  </span>
                </div>
                <button
                  className="ati-btn ati-btn--secondary"
                  onClick={() =>
                    setOpenId(
                      openId === alert.id ? undefined : alert.id,
                    )
                  }
                  type="button"
                >
                  {openId === alert.id ? "Hide" : "Details"}
                </button>
              </div>

              {openId === alert.id ? (
                <div className="committed-job__detail">
                  <dl className="committed-attempt__facts">
                    <dt>Alert key</dt>
                    <dd className="committed-attempt__mono">
                      {alert.alertKey}
                    </dd>
                    <dt>Occurrence</dt>
                    <dd className="committed-attempt__mono">
                      {alert.holidayOccurrenceId ?? "—"}
                    </dd>
                    <dt>Job</dt>
                    <dd className="committed-attempt__mono">
                      {alert.notificationJobId ?? "—"}
                    </dd>
                    <dt>Details</dt>
                    <dd className="committed-attempt__mono">
                      {alert.details
                        ? JSON.stringify(alert.details, null, 2)
                        : "—"}
                    </dd>
                  </dl>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      {data && data.pagination.total > 0 ? (
        <div className="delivery-audit__pagination">
          <span>
            Showing {data.pagination.from}–{data.pagination.to} of{" "}
            {data.pagination.total}
          </span>
          <button
            className="ati-btn ati-btn--secondary"
            disabled={data.pagination.page <= 1}
            onClick={() =>
              setPage((current) => Math.max(1, current - 1))
            }
            type="button"
          >
            Prev
          </button>
          <span>
            Page {data.pagination.page} of {data.pagination.pageCount}
          </span>
          <button
            className="ati-btn ati-btn--secondary"
            disabled={
              data.pagination.page >= data.pagination.pageCount
            }
            onClick={() => setPage((current) => current + 1)}
            type="button"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
