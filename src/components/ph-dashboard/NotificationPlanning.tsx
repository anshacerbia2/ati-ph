"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { mountedPath } from "@/config/app";

const PAGE_SIZE = 10;

type Occurrence = {
  id: string;
  holidayName: string;
  startDate: string;
  endDate: string;
  calendarYear: number;
  regions: Array<{ id: string; code: string; displayName: string }>;
};

type Pagination = {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
};

type OccurrenceResponse = { occurrences: Occurrence[]; pagination: Pagination; error?: string };

type ScheduleCandidate =
  | {
      status: "BLOCKED";
      targetHolidayDate: string;
      reasons: string[];
    }
  | {
      status: "READY";
      targetHolidayDate: string;
      plannedLocalDate: string;
      plannedLocalTime: string;
      timezone: string;
      approvalMode: "REQUIRED" | "NOT_REQUIRED";
      approvalRequired: boolean;
      appliedRules: string[];
    };

type SchedulePreview = {
  status: "READY" | "BLOCKED";
  reasons: string[];
  candidates: ScheduleCandidate[];
};

type PreviewResult = {
  subscriptionId: string;
  clientName: string;
  serviceTeamName: string;
  legacyClientMasterTag: string | null;
  calendarRegion: { id: string; code: string; displayName: string };
  status: "MATCHED" | "EXCLUDED" | "EXCEPTION";
  code: string;
  reason: string;
  matchingDates: string[];
  policy: {
    version: number;
    holidayDayFilter: "WEEKDAY" | "WEEKEND" | "ALL";
    scheduleSource: "GLOBAL" | "CLIENT_OVERRIDE";
  } | null;
  scheduleResolution: {
    source: "GLOBAL" | "CLIENT_OVERRIDE";
    sourceVersion: number | null;
    ready: boolean;
    issues: string[];
  } | null;
  schedule: SchedulePreview | null;
  to: Array<{ contactId: string; displayName: string | null; email: string }>;
  cc: Array<{ contactId: string; displayName: string | null; email: string }>;
};

type Preview = {
  occurrence: {
    id: string;
    holidayName: string;
    startDate: string;
    endDate: string;
    dates: Array<{ date: string; dayType: "WEEKDAY" | "WEEKEND" }>;
    regions: Array<{
      id: string;
      code: string;
      displayName: string;
      candidates: number;
      matched: number;
      excluded: number;
      exceptions: number;
    }>;
  };
  summary: { candidates: number; matched: number; excluded: number; exceptions: number; scheduleReady: number };
  results: PreviewResult[];
  mode: "SHADOW_MATCHING_AND_SCHEDULING";
  error?: string;
};

const EMPTY_PAGINATION: Pagination = { page: 1, pageSize: PAGE_SIZE, pageCount: 1, total: 0, from: 0, to: 0 };

export function NotificationPlanning() {
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [pagination, setPagination] = useState<Pagination>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [previewLoadingId, setPreviewLoadingId] = useState<string>();
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState<string>();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  async function load(targetSearch: string, targetPage: number, signal?: AbortSignal) {
    const params = new URLSearchParams({ page: String(targetPage), pageSize: String(PAGE_SIZE) });
    if (targetSearch) params.set("search", targetSearch);
    const response = await fetch(
      mountedPath(`/api/notification-planning/occurrences?${params.toString()}`),
      { cache: "no-store", signal },
    );
    const payload = (await response.json()) as OccurrenceResponse;
    if (!response.ok) throw new Error(payload.error ?? "Could not load published holidays.");
    return payload;
  }

  function apply(payload: OccurrenceResponse) {
    setOccurrences(payload.occurrences);
    setPagination(payload.pagination);
    if (payload.pagination.page !== page) setPage(payload.pagination.page);
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(search, page, controller.signal)
      .then((payload) => {
        apply(payload);
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(loadError));
        setLoading(false);
      });
    return () => controller.abort();
    // apply intentionally uses current pagination state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    setPreview(undefined);
    setPage(1);
    setSearch(searchInput.trim());
  }

  function clearSearch() {
    setLoading(true);
    setError(undefined);
    setPreview(undefined);
    setSearchInput("");
    setSearch("");
    setPage(1);
  }

  function goToPage(nextPage: number) {
    if (nextPage < 1 || nextPage > pagination.pageCount || nextPage === page) return;
    setLoading(true);
    setError(undefined);
    setPreview(undefined);
    setPage(nextPage);
  }

  async function openPreview(occurrenceId: string) {
    setPreviewLoadingId(occurrenceId);
    setError(undefined);
    try {
      const response = await fetch(
        mountedPath(`/api/notification-planning/preview/${occurrenceId}`),
        { cache: "no-store" },
      );
      const payload = (await response.json()) as Preview;
      if (!response.ok) throw new Error(payload.error ?? "Could not build matching preview.");
      setPreview(payload);
    } catch (previewError) {
      setError(errorMessage(previewError));
    } finally {
      setPreviewLoadingId(undefined);
    }
  }

  useEffect(() => {
    if (!preview) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreview(undefined);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [preview]);

  return (
    <section className="ati-card notification-planning">
      <div className="notification-registry__topbar">
        <form className="notification-search" onSubmit={submitSearch} role="search">
          <label>
            <span>Published holiday</span>
            <input onChange={(event) => setSearchInput(event.target.value)} placeholder="Holiday or region" type="search" value={searchInput} />
          </label>
          <button className="ati-btn ati-btn--secondary" type="submit">Search</button>
          {search ? <button className="ati-btn ati-btn--subtle" onClick={clearSearch} type="button">Clear</button> : null}
        </form>
        <div className="notification-registry__meta"><strong>{pagination.total}</strong><span>published occurrences</span></div>
      </div>

      <div className="notification-shadow-banner">
        <span>SHADOW</span>
        <div>
          <strong>Explainable matching + schedule calculation</strong>
          <p>Preview resolves WHO and deterministically calculates WHEN from confirmed policy fields. It creates no notification run, job, outbox event, or email.</p>
        </div>
      </div>

      {error ? <p className="form-notice form-notice--error">{error}</p> : null}

      {loading ? (
        <NotificationSkeleton />
      ) : occurrences.length === 0 ? (
        <div className="notification-empty"><strong>No published holidays found</strong><span>Publish canonical holiday data before running shadow matching.</span></div>
      ) : (
        <div className="notification-occurrence-list">
          {occurrences.map((occurrence) => (
            <article className="notification-occurrence-card" key={occurrence.id}>
              <div>
                <strong>{occurrence.holidayName}</strong>
                <span>{occurrence.startDate}{occurrence.endDate !== occurrence.startDate ? ` → ${occurrence.endDate}` : ""}</span>
              </div>
              <div className="notification-occurrence-regions">{occurrence.regions.map((region) => <span key={region.id}>{region.code}</span>)}</div>
              <button className="ati-btn ati-btn--secondary" disabled={previewLoadingId === occurrence.id} onClick={() => void openPreview(occurrence.id)} type="button">
                {previewLoadingId === occurrence.id ? "Planning…" : "Preview plan"}
              </button>
            </article>
          ))}
        </div>
      )}

      <NotificationPagination
        pagination={pagination}
        loading={loading}
        goToPage={goToPage}
      />

      {preview ? (
        <MatchingPreviewModal
          onClose={() => setPreview(undefined)}
          preview={preview}
        />
      ) : null}
    </section>
  );
}

function MatchingPreviewModal({
  preview,
  onClose,
}: {
  preview: Preview;
  onClose: () => void;
}) {
  return createPortal(
    <div
      aria-label={`Matching preview for ${preview.occurrence.holidayName}`}
      aria-modal="true"
      className="matching-preview-modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div className="matching-preview-modal__panel">
        <div className="matching-preview-modal__bar">
          <div>
            <span>Shadow notification plan</span>
            <strong>{preview.occurrence.holidayName}</strong>
          </div>
          <button
            aria-label="Close matching preview"
            className="matching-preview-modal__close"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="matching-preview-modal__content">
          <MatchingPreview preview={preview} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function MatchingPreview({ preview }: { preview: Preview }) {
  return (
    <section className="matching-preview">
      <div className="matching-preview__header">
        <div><p className="eyebrow">Shadow result</p><h2>{preview.occurrence.holidayName}</h2><span>{preview.occurrence.startDate} → {preview.occurrence.endDate}</span></div>
        <span className="ati-badge ati-badge--brand">No side effects</span>
      </div>

      <div className="matching-preview__metrics">
        <Metric label="Candidates" value={preview.summary.candidates} />
        <Metric label="Matched" value={preview.summary.matched} />
        <Metric label="Excluded" value={preview.summary.excluded} />
        <Metric label="Exceptions" value={preview.summary.exceptions} />
        <Metric label="Schedule ready" value={preview.summary.scheduleReady} />
      </div>

      <div className="matching-preview__regions">
        {preview.occurrence.regions.map((region) => (
          <div key={region.id}>
            <strong>{region.code} · {region.displayName}</strong>
            <span>{region.matched} matched · {region.excluded} excluded · {region.exceptions} exceptions</span>
          </div>
        ))}
      </div>

      <div className="matching-result-list">
        {preview.results.length === 0 ? (
          <div className="notification-empty"><strong>No routing candidates</strong><span>This can be valid when no subscription follows the affected region.</span></div>
        ) : preview.results.map((result) => (
          <article className={`matching-result matching-result--${result.status.toLowerCase()}`} key={result.subscriptionId}>
            <div className="matching-result__top">
              <div>
                <strong>{result.clientName}</strong>
                <span>{result.calendarRegion.displayName}</span>
              </div>
              <span className={result.status === "MATCHED" ? "ati-badge ati-badge--success" : result.status === "EXCEPTION" ? "ati-badge ati-badge--warning" : "ati-badge"}>{result.status}</span>
            </div>
            <p>{result.reason}</p>
            {result.legacyClientMasterTag ? (
              <div className="matching-result__legacy-tag">
                <strong>Client_Master Tag</strong>
                <span>{result.legacyClientMasterTag} · evidence only, not matching authority</span>
              </div>
            ) : null}
            <div className="matching-result__facts">
              <Fact label="Rule" value={humanize(result.code)} />
              <Fact label="Dates" value={result.matchingDates.length ? result.matchingDates.join(", ") : "None"} />
              <Fact label="Policy" value={result.policy ? `v${result.policy.version} · ${humanize(result.policy.holidayDayFilter)}` : "Not resolved"} />
              <Fact
                label="Schedule"
                value={
                  result.scheduleResolution
                    ? `${result.scheduleResolution.source === "GLOBAL" ? "Global" : "Client override"} · ${result.schedule?.status ?? "Blocked"}`
                    : "Not applicable"
                }
              />
            </div>
            {result.scheduleResolution?.issues.length ? <div className="matching-result__issues">{result.scheduleResolution.issues.map((issue) => <span key={issue}>{humanize(issue)}</span>)}</div> : null}
            {result.schedule ? <SchedulePreviewBlock schedule={result.schedule} /> : null}
            <RecipientGroup label="Client PIC Email (TO)" recipients={result.to} />
            <RecipientGroup label="CC" recipients={result.cc} />
          </article>
        ))}
      </div>
    </section>
  );
}

function SchedulePreviewBlock({
  schedule,
}: {
  schedule: SchedulePreview;
}) {
  return (
    <div
      className={
        schedule.status === "READY"
          ? "matching-schedule matching-schedule--ready"
          : "matching-schedule matching-schedule--blocked"
      }
    >
      <div className="matching-schedule__heading">
        <strong>
          {schedule.status === "READY"
            ? "Planned send schedule"
            : "Schedule blocked"}
        </strong>
        <span>{schedule.status}</span>
      </div>

      {schedule.status === "BLOCKED" && schedule.reasons.length ? (
        <div className="matching-schedule__reasons">
          {schedule.reasons.map((reason) => (
            <span key={reason}>{humanize(reason)}</span>
          ))}
        </div>
      ) : null}

      {schedule.candidates.map((candidate) => (
        <div
          className="matching-schedule__candidate"
          key={candidate.targetHolidayDate}
        >
          <div>
            <span>Holiday date</span>
            <strong>{candidate.targetHolidayDate}</strong>
          </div>
          {candidate.status === "READY" ? (
            <>
              <div>
                <span>Planned send</span>
                <strong>
                  {candidate.plannedLocalDate} · {candidate.plannedLocalTime}
                </strong>
              </div>
              <div>
                <span>Timezone</span>
                <strong>{candidate.timezone}</strong>
              </div>
              <div>
                <span>Approval</span>
                <strong>
                  {candidate.approvalRequired ? "Required" : "Not required"}
                </strong>
              </div>
              <div className="matching-schedule__rules">
                {candidate.appliedRules.map((rule) => (
                  <span key={rule}>{humanize(rule)}</span>
                ))}
              </div>
            </>
          ) : (
            <div className="matching-schedule__candidate-blocked">
              {candidate.reasons.map((reason) => (
                <span key={reason}>{humanize(reason)}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function RecipientGroup({ label, recipients }: { label: string; recipients: PreviewResult["to"] }) {
  if (!recipients.length) return null;
  return (
    <div className="matching-recipients">
      <strong>{label}</strong>
      <div>{recipients.map((recipient) => <span key={recipient.contactId} title={recipient.email}>{recipient.displayName || recipient.email}</span>)}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function Fact({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

function NotificationPagination({ pagination, loading, goToPage }: { pagination: Pagination; loading: boolean; goToPage: (page: number) => void }) {
  if (!pagination.total) return null;
  return (
    <nav aria-label="Published holiday pagination" className="notification-pagination">
      <span>Showing <strong>{pagination.from}–{pagination.to}</strong> of <strong>{pagination.total}</strong></span>
      <div>
        <button disabled={pagination.page <= 1 || loading} onClick={() => goToPage(pagination.page - 1)} type="button">Prev</button>
        <span>Page {pagination.page} of {pagination.pageCount}</span>
        <button disabled={pagination.page >= pagination.pageCount || loading} onClick={() => goToPage(pagination.page + 1)} type="button">Next</button>
      </div>
    </nav>
  );
}

function NotificationSkeleton() { return <div className="notification-skeleton-list">{Array.from({ length: 5 }, (_, index) => <div className="notification-skeleton" key={index}><span /><span /></div>)}</div>; }
function humanize(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase()); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Notification planning request failed."; }
