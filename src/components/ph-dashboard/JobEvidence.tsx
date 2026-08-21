"use client";

export type Attempt = {
  id: string;
  attemptNumber: number;
  status: string;
  provider: string | null;
  providerMessageId: string | null;
  acceptedRecipients: string[];
  rejectedRecipients: string[];
  failureClass: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  claimedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  leaseRetrySafe: boolean;
  reconciliation: {
    action: string;
    note: string | null;
    at: string | null;
    by: string | null;
  } | null;
};

export type Job = {
  id: string;
  status: string;
  approvalMode: string;
  automaticSendAllowed: boolean;
  scheduledAt: string;
  plannedLocalDate: string;
  plannedLocalTime: string;
  timezone: string;
  sentAt: string | null;
  failedAt: string | null;
  retryAt: string | null;
  attemptCount: number;
  retryCeiling: number | null;
  lastError: string | null;
  holiday: {
    occurrenceId: string;
    name: string;
    startDate: string;
    endDate: string;
    supersededAt: string | null;
  };
  client: { name: string; serviceTeam: string };
  recipients: { to: string[]; cc: string[] };
  content: {
    subject: string | null;
    sha256: string | null;
    html: string | null;
  };
  attempts: Attempt[];
};

/**
 * Statuses that need somebody. Everything else is the system working, and colouring it
 * would spend the reader's attention on rows that do not want it.
 */
const NEEDS_ATTENTION = new Set(["FAILED", "CANCELLED"]);

export function statusClassName(status: string): string {
  const base = "committed-job__status";
  if (status === "SENT") return `${base} ${base}--ok`;
  if (NEEDS_ATTENTION.has(status)) return `${base} ${base}--bad`;
  if (status === "RETRY_WAIT" || status === "DUE") {
    return `${base} ${base}--warn`;
  }
  return base;
}

export function when(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function duration(ms: number | null): string {
  if (ms === null) return "still claimed";
  return ms < 1_000 ? `${ms}ms` : `${(ms / 1_000).toFixed(1)}s`;
}

/**
 * One job, with its evidence behind a disclosure.
 *
 * Shared by the plan modal and the delivery list so the two cannot drift into showing
 * the same facts differently — which on an audit screen is worse than showing fewer.
 *
 * `showHoliday` is the only difference between the two callers: inside one occurrence's
 * modal the holiday is the heading above, and repeating it on every row would be noise.
 */
export function JobEvidence({
  job,
  detail,
  open,
  busy,
  onToggle,
  showHoliday = false,
}: {
  job: Job;
  detail?: Job;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  showHoliday?: boolean;
}) {
  const shown = open && detail?.id === job.id ? detail : job;

  return (
    <article className="committed-job">
      <div className="committed-job__row">
        <span className={statusClassName(job.status)}>
          {job.status.replace(/_/g, " ")}
        </span>
        <div className="committed-job__identity">
          <strong>{job.client.name}</strong>
          <span>{job.client.serviceTeam}</span>
        </div>
        <div className="committed-job__facts">
          {showHoliday ? (
            <span>
              {job.holiday.name} · {job.holiday.startDate}
              {job.holiday.supersededAt ? " · superseded" : ""}
            </span>
          ) : null}
          <span>
            Planned {job.plannedLocalDate} {job.plannedLocalTime}{" "}
            {job.timezone}
          </span>
          <span>
            {job.sentAt
              ? `Sent ${when(job.sentAt)}`
              : job.failedAt
                ? `Failed ${when(job.failedAt)}`
                : job.retryAt
                  ? `Retry ${when(job.retryAt)}`
                  : `Scheduled ${when(job.scheduledAt)}`}
          </span>
          <span>
            {job.recipients.to.join(", ") || "no recipients"}
            {job.recipients.cc.length > 0
              ? ` · cc ${job.recipients.cc.join(", ")}`
              : ""}
          </span>
        </div>
        <button
          className="ati-btn ati-btn--secondary"
          onClick={onToggle}
          type="button"
        >
          {open ? "Hide" : "Evidence"}
        </button>
      </div>

      {open ? (
        <div className="committed-job__detail">
          <div className="committed-job__attempts">
            {shown.attempts.length === 0 ? (
              <p className="committed-jobs__empty">
                No delivery attempt yet. The worker claims a job only once it is DUE and
                the delivery gates are open.
              </p>
            ) : (
              shown.attempts.map((attempt) => (
                <div className="committed-attempt" key={attempt.id}>
                  <div className="committed-attempt__head">
                    <span className={statusClassName(attempt.status)}>
                      #{attempt.attemptNumber} {attempt.status}
                    </span>
                    <span>{attempt.provider ?? "—"}</span>
                    <span>{duration(attempt.durationMs)}</span>
                    <span>
                      {attempt.leaseRetrySafe
                        ? "retry-safe lease"
                        : "not retry-safe"}
                    </span>
                  </div>
                  <dl className="committed-attempt__facts">
                    <dt>Claimed</dt>
                    <dd>{when(attempt.claimedAt)}</dd>
                    <dt>Completed</dt>
                    <dd>{when(attempt.completedAt)}</dd>
                    <dt>Accepted</dt>
                    <dd>
                      {attempt.acceptedRecipients.join(", ") || "—"}
                    </dd>
                    <dt>Rejected</dt>
                    <dd>
                      {attempt.rejectedRecipients.join(", ") || "—"}
                    </dd>
                    <dt>Provider message id</dt>
                    <dd className="committed-attempt__mono">
                      {attempt.providerMessageId ?? "—"}
                    </dd>
                    {attempt.failureClass ? (
                      <>
                        <dt>Failure</dt>
                        <dd>
                          {attempt.failureClass}
                          {attempt.errorCode
                            ? ` · ${attempt.errorCode}`
                            : ""}
                          {attempt.errorMessage
                            ? ` — ${attempt.errorMessage}`
                            : ""}
                        </dd>
                      </>
                    ) : null}
                    {attempt.reconciliation ? (
                      <>
                        <dt>Reconciled</dt>
                        <dd>
                          {attempt.reconciliation.action} by{" "}
                          {attempt.reconciliation.by ?? "—"} on{" "}
                          {when(attempt.reconciliation.at)}
                          {attempt.reconciliation.note
                            ? ` — ${attempt.reconciliation.note}`
                            : ""}
                        </dd>
                      </>
                    ) : null}
                  </dl>
                </div>
              ))
            )}
          </div>

          <div className="committed-job__content">
            <div className="committed-job__content-head">
              <strong>
                {shown.content.subject ?? "No frozen subject"}
              </strong>
              <span className="committed-attempt__mono">
                sha256 {shown.content.sha256 ?? "—"}
              </span>
            </div>
            {busy ? (
              <p className="committed-jobs__empty">Loading email…</p>
            ) : shown.content.html ? (
              /*
               * Sandboxed with no allowances at all: the frozen body renders in an
               * opaque origin with no scripts, no forms and no network. It is this
               * application's own template today, and it is still the exact bytes a mail
               * system accepted — which is not a thing to inject into the operator's own
               * document.
               */
              <iframe
                className="committed-job__email"
                sandbox=""
                srcDoc={shown.content.html}
                title="Delivered email"
              />
            ) : (
              <p className="committed-jobs__empty">
                This job carries no frozen content. Jobs committed before content
                freezing are intentionally ineligible for delivery.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
}
