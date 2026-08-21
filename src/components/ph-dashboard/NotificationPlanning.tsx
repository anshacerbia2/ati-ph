"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { CommittedJobs } from "@/components/ph-dashboard/CommittedJobs";
import { mountedPath } from "@/config/app";

const PAGE_SIZE = 10;

type Occurrence = {
  id: string;
  holidayName: string;
  startDate: string;
  endDate: string;
  calendarYear: number;
  notificationCommittedAt: string | null;
  approvalState:
    | "NOT_COMMITTED"
    | "NOT_REQUIRED"
    | "REQUIRED"
    | "PENDING"
    | "APPROVED"
    | "REJECTED";
  regions: Array<{ id: string; code: string; displayName: string }>;
  delivery: JobStatusCounts;
};

type JobStatusCounts = {
  WAITING_APPROVAL: number;
  PLANNED: number;
  DUE: number;
  PROCESSING: number;
  RETRY_WAIT: number;
  SENT: number;
  FAILED: number;
  CANCELLED: number;
  total: number;
};

/**
 * What happened to this occurrence's jobs, as a line a reader can scan.
 *
 * The row used to say `Committed` and go on saying it while the jobs underneath were
 * delivered, failed and retried — the badge stopped being informative at the moment
 * something started happening.
 *
 * Only non-zero statuses appear, because a row padded with `0 failed · 0 cancelled`
 * hides the one number that matters among six that do not. `FAILED` and `RETRY_WAIT` are
 * marked so they read differently at a glance; nothing else is coloured, so colour keeps
 * meaning "look here".
 */
function deliveryParts(
  counts: JobStatusCounts,
): Array<{ key: string; label: string; tone?: "bad" | "warn" }> {
  const parts: Array<{
    key: string;
    label: string;
    tone?: "bad" | "warn";
  }> = [
    {
      key: "total",
      label: `${counts.total} ${counts.total === 1 ? "job" : "jobs"}`,
    },
  ];

  const add = (
    key: keyof JobStatusCounts,
    label: string,
    tone?: "bad" | "warn",
  ) => {
    if (counts[key] > 0) {
      parts.push({ key, label: `${counts[key]} ${label}`, tone });
    }
  };

  add("SENT", "sent");
  add("FAILED", "failed", "bad");
  add("RETRY_WAIT", "retrying", "warn");
  add("DUE", "due", "warn");
  add("PROCESSING", "sending");
  add("PLANNED", "planned");
  add("WAITING_APPROVAL", "waiting approval");
  add("CANCELLED", "cancelled");

  return parts;
}

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

type ApprovalView = {
  state:
    | "NOT_COMMITTED"
    | "NOT_REQUIRED"
    | "REQUIRED"
    | "PENDING"
    | "APPROVED"
    | "REJECTED";
  counts: {
    waitingApproval: number;
    planned: number;
    due: number;
    processing: number;
    sent: number;
    failed: number;
    cancelled: number;
  };
  approval: {
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
    requestedAt: string;
    decidedAt: string | null;
    decisionReason: string | null;
  } | null;
  makerCheckerBlocked: boolean;
  error?: string;
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
  commit:
    | {
        state: "COMMITTED";
        committedAt: string;
        reasons: [];
      }
    | {
        state: "READY";
        committedAt: null;
        reasons: [];
      }
    | {
        state: "BLOCKED";
        committedAt: null;
        reasons: string[];
      };
  mode: "SHADOW_MATCHING_AND_SCHEDULING";
  error?: string;
};

const EMPTY_PAGINATION: Pagination = { page: 1, pageSize: PAGE_SIZE, pageCount: 1, total: 0, from: 0, to: 0 };

export function NotificationPlanning({
  canCommit,
  canApprove,
}: {
  canCommit: boolean;
  canApprove: boolean;
}) {
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [pagination, setPagination] = useState<Pagination>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [previewLoadingId, setPreviewLoadingId] = useState<string>();
  const [preview, setPreview] = useState<Preview>();
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitNotice, setCommitNotice] = useState<string>();
  const [approval, setApproval] = useState<ApprovalView>();
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalNotice, setApprovalNotice] = useState<string>();
  const [decisionNote, setDecisionNote] = useState("");
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

  async function loadApprovalState(occurrenceId: string) {
    const response = await fetch(
      mountedPath(
        `/api/notification-planning/approval/${occurrenceId}`,
      ),
      { cache: "no-store" },
    );
    const payload = (await response.json()) as ApprovalView;
    if (!response.ok) {
      throw new Error(
        payload.error ?? "Could not load notification approval state.",
      );
    }
    setApproval(payload);
    return payload;
  }

  async function openPreview(occurrenceId: string) {
    setPreviewLoadingId(occurrenceId);
    setError(undefined);
    setCommitNotice(undefined);
    setApprovalNotice(undefined);
    setDecisionNote("");
    setApproval(undefined);
    try {
      const response = await fetch(
        mountedPath(`/api/notification-planning/preview/${occurrenceId}`),
        { cache: "no-store" },
      );
      const payload = (await response.json()) as Preview;
      if (!response.ok) throw new Error(payload.error ?? "Could not build matching preview.");
      setPreview(payload);
      if (payload.commit.state === "COMMITTED") {
        await loadApprovalState(occurrenceId);
      }
    } catch (previewError) {
      setError(errorMessage(previewError));
    } finally {
      setPreviewLoadingId(undefined);
    }
  }

  async function commitPlan() {
    if (!preview || preview.commit.state !== "READY") return;

    setCommitBusy(true);
    setError(undefined);

    try {
      const occurrenceId = preview.occurrence.id;
      const response = await fetch(
        mountedPath(
          `/api/notification-planning/commit/${occurrenceId}`,
        ),
        { method: "POST" },
      );

      const payload = (await response.json()) as {
        error?: string;
        jobCount?: number;
        plannedCount?: number;
        waitingApprovalCount?: number;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Could not commit notification plan.",
        );
      }

      const refreshedOccurrences = await load(search, page);
      apply(refreshedOccurrences);
      await openPreview(occurrenceId);
      setCommitNotice(
        `Committed ${payload.jobCount ?? 0} durable job(s): ${payload.plannedCount ?? 0} planned, ${payload.waitingApprovalCount ?? 0} waiting approval.`,
      );
    } catch (commitError) {
      setError(errorMessage(commitError));
    } finally {
      setCommitBusy(false);
    }
  }

  async function requestApproval() {
    if (!preview || preview.commit.state !== "COMMITTED") return;

    setApprovalBusy(true);
    setError(undefined);
    setApprovalNotice(undefined);

    try {
      const occurrenceId = preview.occurrence.id;
      const response = await fetch(
        mountedPath(
          `/api/notification-planning/approval/${occurrenceId}`,
        ),
        { method: "POST" },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          payload.error ?? "Could not request notification approval.",
        );
      }
      const refreshedOccurrences = await load(
        search,
        page,
      );
      apply(refreshedOccurrences);
      await loadApprovalState(occurrenceId);
      setApprovalNotice("Approval requested.");
    } catch (approvalError) {
      setError(errorMessage(approvalError));
    } finally {
      setApprovalBusy(false);
    }
  }

  async function decideApproval(
    decision: "APPROVE" | "REJECT",
  ) {
    if (!preview || preview.commit.state !== "COMMITTED") return;

    setApprovalBusy(true);
    setError(undefined);
    setApprovalNotice(undefined);

    try {
      const occurrenceId = preview.occurrence.id;
      const response = await fetch(
        mountedPath(
          `/api/notification-planning/approval/${occurrenceId}`,
        ),
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decision,
            reason: decisionNote,
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          payload.error ?? "Could not decide notification approval.",
        );
      }
      const refreshedOccurrences = await load(
        search,
        page,
      );
      apply(refreshedOccurrences);
      await loadApprovalState(occurrenceId);
      setDecisionNote("");
      setApprovalNotice(
        decision === "APPROVE"
          ? "Approval accepted. Waiting jobs are now PLANNED."
          : "Approval rejected. Waiting jobs are now CANCELLED.",
      );
    } catch (approvalError) {
      setError(errorMessage(approvalError));
    } finally {
      setApprovalBusy(false);
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
          <strong>Preview first, commit explicitly</strong>
          <p>Preview resolves WHO and WHEN with no side effects. Authorized users can then commit a ready plan into immutable durable jobs. The worker only marks due jobs; it still sends no email.</p>
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
                <span className="notification-occurrence-delivery">
                  {occurrence.delivery.total === 0
                    ? "No jobs committed yet"
                    : deliveryParts(occurrence.delivery).map(
                        (part, index) => (
                          <span
                            className={
                              part.tone
                                ? `notification-occurrence-delivery__part notification-occurrence-delivery__part--${part.tone}`
                                : "notification-occurrence-delivery__part"
                            }
                            key={part.key}
                          >
                            {index > 0 ? " · " : ""}
                            {part.label}
                          </span>
                        ),
                      )}
                </span>
              </div>
              <div className="notification-occurrence-regions">
                {occurrence.regions.map((region) => (
                  <span key={region.id}>{region.code}</span>
                ))}
                {occurrence.notificationCommittedAt ? (
                  <span className="notification-occurrence-committed">
                    Committed
                  </span>
                ) : null}
                {occurrence.approvalState !== "NOT_COMMITTED" ? (
                  <span
                    className={approvalListClassName(
                      occurrence.approvalState,
                    )}
                  >
                    {approvalListLabel(
                      occurrence.approvalState,
                    )}
                  </span>
                ) : null}
              </div>
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
          approval={approval}
          approvalBusy={approvalBusy}
          approvalNotice={approvalNotice}
          canApprove={canApprove}
          canCommit={canCommit}
          commitBusy={commitBusy}
          commitNotice={commitNotice}
          decisionNote={decisionNote}
          onClose={() => setPreview(undefined)}
          onCommit={() => void commitPlan()}
          onDecisionNote={setDecisionNote}
          onDecideApproval={(decision) => void decideApproval(decision)}
          onRequestApproval={() => void requestApproval()}
          preview={preview}
        />
      ) : null}
    </section>
  );
}

function MatchingPreviewModal({
  preview,
  approval,
  canCommit,
  canApprove,
  commitBusy,
  commitNotice,
  approvalBusy,
  approvalNotice,
  decisionNote,
  onCommit,
  onRequestApproval,
  onDecideApproval,
  onDecisionNote,
  onClose,
}: {
  preview: Preview;
  approval: ApprovalView | undefined;
  canCommit: boolean;
  canApprove: boolean;
  commitBusy: boolean;
  commitNotice: string | undefined;
  approvalBusy: boolean;
  approvalNotice: string | undefined;
  decisionNote: string;
  onCommit: () => void;
  onRequestApproval: () => void;
  onDecideApproval: (decision: "APPROVE" | "REJECT") => void;
  onDecisionNote: (value: string) => void;
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

        <div className="matching-preview-modal__commit">
          <div>
            <strong>
              {preview.commit.state === "READY"
                ? "Ready to commit"
                : preview.commit.state === "COMMITTED"
                  ? "Plan committed"
                  : "Commit blocked"}
            </strong>
            <span>
              {preview.commit.state === "READY"
                ? "Commit freezes the current routing, recipients, policy versions, and calculated send time into durable jobs."
                : preview.commit.state === "COMMITTED"
                  /*
                   * "delivery is still disabled" was true when nothing could send and
                   * became a claim the screen could not back up once the release
                   * controls existed. What is always true is where the answer lives.
                   */
                  ? `Committed ${new Date(preview.commit.committedAt).toLocaleString()}. The scheduler marks eligible jobs DUE; whether they are delivered depends on the release controls shown under Trusted automation.`
                  : preview.commit.reasons.map(humanize).join(" · ")}
            </span>
          </div>

          {commitNotice ? (
            <span className="matching-preview-modal__commit-notice">
              {commitNotice}
            </span>
          ) : null}

          {canCommit && preview.commit.state === "READY" ? (
            <button
              className="ati-btn"
              disabled={commitBusy}
              onClick={onCommit}
              type="button"
            >
              {commitBusy ? "Committing…" : "Commit plan"}
            </button>
          ) : null}
        </div>

        {preview.commit.state === "COMMITTED" && approval ? (
          <div className="matching-preview-modal__approval">
            <div className="matching-preview-modal__approval-copy">
              <span
                className={`ati-badge ${
                  approval.state === "APPROVED"
                    ? "ati-badge--success"
                    : approval.state === "PENDING" ||
                        approval.state === "REQUIRED"
                      ? "ati-badge--warning"
                      : approval.state === "REJECTED"
                        ? "ati-badge--danger"
                        : ""
                }`}
              >
                {approvalLabel(approval.state)}
              </span>
              <div>
                <strong>Notification approval</strong>
                <span>
                  {approvalSummary(approval)}
                </span>
              </div>
            </div>

            {approvalNotice ? (
              <span className="matching-preview-modal__commit-notice">
                {approvalNotice}
              </span>
            ) : null}

            {approval.state === "REQUIRED" && canCommit ? (
              <button
                className="ati-btn ati-btn--secondary"
                disabled={approvalBusy}
                onClick={onRequestApproval}
                type="button"
              >
                {approvalBusy ? "Requesting…" : "Request approval"}
              </button>
            ) : null}

            {approval.state === "PENDING" ? (
              <div className="matching-preview-modal__approval-actions">
                {approval.makerCheckerBlocked ? (
                  <span>
                    Maker-checker requires another approver.
                  </span>
                ) : canApprove ? (
                  <>
                    <input
                      aria-label="Approval decision note"
                      maxLength={1000}
                      onChange={(event) => onDecisionNote(event.target.value)}
                      placeholder="Decision note; required for rejection"
                      type="text"
                      value={decisionNote}
                    />
                    <button
                      className="ati-btn"
                      disabled={approvalBusy}
                      onClick={() => onDecideApproval("APPROVE")}
                      type="button"
                    >
                      Approve
                    </button>
                    <button
                      className="ati-btn ati-btn--secondary"
                      disabled={approvalBusy}
                      onClick={() => onDecideApproval("REJECT")}
                      type="button"
                    >
                      Reject
                    </button>
                  </>
                ) : (
                  <span>Waiting for an authorized approver.</span>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {/*
          * The other half of this modal: what the plan above actually became.
          *
          * Only after a commit, because before one there are no jobs — and a section
          * that renders "nothing yet" on every uncommitted plan would train people to
          * scroll past it.
          */}
        {preview.commit.state === "COMMITTED" ? (
          <CommittedJobs occurrenceId={preview.occurrence.id} />
        ) : null}
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
function approvalListLabel(
  state: Occurrence["approvalState"],
) {
  if (state === "NOT_REQUIRED") return "No approval";
  if (state === "REQUIRED") return "Approval required";
  if (state === "PENDING") return "Approval pending";
  if (state === "APPROVED") return "Approved";
  if (state === "REJECTED") return "Rejected";
  return "Not committed";
}

function approvalListClassName(
  state: Occurrence["approvalState"],
) {
  return `notification-occurrence-approval notification-occurrence-approval--${state.toLowerCase().replaceAll("_", "-")}`;
}

function approvalLabel(state: ApprovalView["state"]) {
  if (state === "NOT_REQUIRED") return "Approval not required";
  if (state === "REQUIRED") return "Approval required";
  if (state === "PENDING") return "Approval pending";
  if (state === "APPROVED") return "Approved";
  if (state === "REJECTED") return "Rejected";
  return "Not committed";
}

function approvalSummary(approval: ApprovalView) {
  if (approval.state === "NOT_REQUIRED") {
    return "No committed jobs require maker-checker approval.";
  }
  if (approval.state === "REQUIRED") {
    return `${approval.counts.waitingApproval} committed job(s) require an approval request.`;
  }
  if (approval.state === "PENDING") {
    return `${approval.counts.waitingApproval} job(s) are frozen while the approval request is pending.`;
  }
  if (approval.state === "APPROVED") {
    return `Approved. ${approval.counts.planned} job(s) are PLANNED and will become DUE on schedule.`;
  }
  if (approval.state === "REJECTED") {
    return `Rejected. ${approval.counts.cancelled} job(s) are CANCELLED.`;
  }
  return "Commit a notification plan before approval.";
}

function humanize(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase()); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Notification planning request failed."; }
