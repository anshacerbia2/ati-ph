"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { mountedPath } from "@/config/app";
import type { NormalizedHolidayRow } from "@/imports/contracts";
import {
  validationFieldLabel,
  validationIssueTitle,
} from "@/imports/issue-display";

const REVIEW_PAGE_SIZE = 10;

type ReviewIssue = {
  id: string;
  severity: "ERROR" | "WARNING" | "INFO";
  errorCode: string;
  fieldName: string | null;
  rejectedValue: string | null;
  message: string;
  sourceSheet: string | null;
  sourceRowNumber: number | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
};

type ReviewRow = {
  id: string;
  sourceSheet: string;
  sourceRowNumber: number;
  status: "VALID" | "INVALID" | "EXCLUDED";
  normalizedData: NormalizedHolidayRow;
  excludedReason: string | null;
  editedAt: string | null;
  editedBy: string | null;
};

type PublishedOccurrenceView = {
  id: string;
  holidayName: string;
  sourceRowNumber: number;
  startDate: string;
  endDate: string;
  calendarYear: number;
  publishedAt: string;
  regionCodes: string[];
  dates: {
    date: string;
    dayOfWeek: string;
    dayType: string;
  }[];
};

type ReviewBatch = {
  id: string;
  batchNumber: string;
  sourceName: string;
  status:
    | "UPLOADED"
    | "VERIFYING"
    | "VALIDATED"
    | "INVALID"
    | "FAILED";
  schemaVersion: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningCount: number;
  uploadedAt: string;
  frozen: boolean;
  submittedAt: string | null;
  publishedAt: string | null;
  verificationStartedAt: string | null;
  verifiedAt: string | null;
  failureReason: string | null;
  publishedOccurrences: PublishedOccurrenceView[];
  uploadedBy: {
    displayName: string | null;
    email: string;
  };
  rows: ReviewRow[];
  issues: ReviewIssue[];
};

type RegionOption = {
  code: string;
  displayName: string;
};

type ApprovalView = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  contentHash: string;
  requestedAt: string;
  decidedAt: string | null;
  decisionReason: string | null;
  requestedById: string;
  requestedBy: string;
  decidedBy: string | null;
};

export function ImportBatchReview({
  batch,
  activeRegions,
  approvals,
  canEditStaging,
  canApprove,
  canPublish,
  currentUserId,
}: {
  batch: ReviewBatch;
  activeRegions: RegionOption[];
  approvals: ApprovalView[];
  canEditStaging: boolean;
  canApprove: boolean;
  canPublish: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string>();
  const [error, setError] = useState<string>();

  async function mutate(
    key: string,
    url: string,
    body: unknown,
    method: "POST" | "PATCH" = "PATCH",
  ) {
    setBusyKey(key);
    setError(undefined);

    try {
      const response = await fetch(mountedPath(url), {
        method,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Staging update failed.",
        );
      }

      router.refresh();
      return true;
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Staging update failed.",
      );
      return false;
    } finally {
      setBusyKey(undefined);
    }
  }

  const unacknowledgedWarnings = batch.issues.filter(
    (issue) =>
      issue.severity === "WARNING" && !issue.acknowledgedAt,
  ).length;

  return (
    <>
      <section className="ati-card import-review-summary">
        <div className="import-review-summary__top">
          <div>
            <p className="eyebrow">Batch evidence</p>
            <h2>{batch.sourceName}</h2>
            <p>
              Uploaded by{" "}
              {batch.uploadedBy.displayName ??
                batch.uploadedBy.email}{" "}
              on {formatDate(batch.uploadedAt)}
            </p>
          </div>

          <span className={statusBadge(batch.status)}>
            {batch.status}
          </span>
        </div>

        <dl className="import-metrics">
          <div>
            <dt>Rows</dt>
            <dd>{batch.totalRows}</dd>
          </div>
          <div>
            <dt>Valid</dt>
            <dd>{batch.validRows}</dd>
          </div>
          <div>
            <dt>Invalid</dt>
            <dd>{batch.invalidRows}</dd>
          </div>
          <div>
            <dt>Warnings open</dt>
            <dd>{unacknowledgedWarnings}</dd>
          </div>
        </dl>

        <div className="import-download-actions import-review-summary__actions">
          <a
            className="ati-btn ati-btn--compact ati-btn--subtle"
            href={mountedPath(
              `/api/imports/${batch.id}/validation-report`,
            )}
          >
            Validation report
          </a>
          <a
            className="ati-btn ati-btn--compact ati-btn--neutral-subtle"
            href={mountedPath(
              `/api/imports/${batch.id}/raw`,
            )}
          >
            Original workbook
          </a>
        </div>
      </section>

      {error ? (
        <p className="form-notice form-notice--error">
          {error}
        </p>
      ) : null}

      {batch.status === "UPLOADED" ||
      batch.status === "VERIFYING" ? (
        <p className="form-notice form-notice--warning">
          Authoritative server verification is pending. Staging
          correction, warning acknowledgement, approval, and
          publication remain locked until the worker verifies the
          stored raw workbook against the client preview fingerprint.
        </p>
      ) : null}

      {batch.status === "FAILED" &&
      batch.failureReason ? (
        <p className="form-notice form-notice--error">
          Workbook verification failed: {batch.failureReason}
        </p>
      ) : null}

      <ApprovalPanel
        approvals={approvals}
        batch={batch}
        busyKey={busyKey}
        canApprove={canApprove}
        canPublish={canPublish}
        canSubmit={canEditStaging}
        currentUserId={currentUserId}
        mutate={mutate}
      />

      <PublicationLineage batch={batch} />

      <StagingRows
        activeRegions={activeRegions}
        batch={batch}
        busyKey={busyKey}
        canEdit={canEditStaging}
        mutate={mutate}
      />

      <ValidationIssues
        batch={batch}
        busyKey={busyKey}
        canAcknowledge={canEditStaging}
        mutate={mutate}
      />
    </>
  );
}

function ApprovalPanel({
  batch,
  approvals,
  canSubmit,
  canApprove,
  canPublish,
  currentUserId,
  busyKey,
  mutate,
}: {
  batch: ReviewBatch;
  approvals: ApprovalView[];
  canSubmit: boolean;
  canApprove: boolean;
  canPublish: boolean;
  currentUserId: string;
  busyKey?: string;
  mutate: (
    key: string,
    url: string,
    body: unknown,
    method?: "POST" | "PATCH",
  ) => Promise<boolean>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const latest = approvals[0];
  const pending = approvals.find(
    (approval) => approval.status === "PENDING",
  );
  const openWarnings = batch.issues.filter(
    (issue) =>
      issue.severity === "WARNING" && !issue.acknowledgedAt,
  ).length;
  const eligible =
    batch.status === "VALIDATED" &&
    batch.invalidRows === 0 &&
    batch.validRows > 0 &&
    openWarnings === 0 &&
    !batch.issues.some((issue) => issue.severity === "ERROR");

  async function submit() {
    await mutate(
      "approval-submit",
      `/api/imports/${batch.id}/approval`,
      {},
      "POST",
    );
  }

  async function decide(
    decision: "APPROVE" | "REJECT",
  ) {
    const saved = await mutate(
      `approval-${decision.toLowerCase()}`,
      `/api/imports/${batch.id}/approval`,
      {
        decision,
        reason: reason.trim(),
      },
    );

    if (saved) {
      setRejecting(false);
      setReason("");
    }
  }

  return (
    <section className="ati-card approval-panel">
      <div className="import-review-issues__header">
        <div>
          <p className="eyebrow">Maker-checker</p>
          <h2>Approval</h2>
          <p>
            Submission freezes staging and warning acknowledgement.
            The approver must be a different ATI PH user from the
            requester.
          </p>
        </div>

        {latest ? (
          <span className={approvalBadge(latest.status)}>
            {latest.status}
          </span>
        ) : (
          <span className="ati-badge ati-badge--brand">
            Not submitted
          </span>
        )}
      </div>

      {pending ? (
        <div className="approval-panel__pending">
          <div>
            <strong>Awaiting decision</strong>
            <span>
              Requested by {pending.requestedBy} ·{" "}
              {formatDate(pending.requestedAt)}
            </span>
            <code title={pending.contentHash}>
              {pending.contentHash.slice(0, 16)}…
            </code>
          </div>

          {canApprove &&
          pending.requestedById !== currentUserId ? (
            <div className="approval-panel__actions">
              <button
                className="ati-btn ati-btn--compact"
                disabled={busyKey === "approval-approve"}
                onClick={() => void decide("APPROVE")}
                type="button"
              >
                Approve
              </button>
              <button
                className="ati-btn ati-btn--compact ati-btn--danger-subtle"
                onClick={() => setRejecting((value) => !value)}
                type="button"
              >
                Reject
              </button>
            </div>
          ) : (
            <span className="approval-panel__hint">
              {pending.requestedById === currentUserId
                ? "Waiting for a different approver"
                : "Approval permission required"}
            </span>
          )}
        </div>
      ) : latest?.status === "APPROVED" ? (
        <div className="approval-panel__decision">
          <div>
            <strong>
              {batch.publishedAt
                ? "Canonical calendar published"
                : "Approved for canonical publication"}
            </strong>
            <span>
              {latest.decidedBy
                ? `Decided by ${latest.decidedBy}`
                : "Decision recorded"}
              {latest.decidedAt
                ? ` · ${formatDate(latest.decidedAt)}`
                : ""}
            </span>
            {batch.publishedAt ? (
              <span>
                Published {formatDate(batch.publishedAt)}
              </span>
            ) : null}
            {latest.decisionReason ? (
              <p>{latest.decisionReason}</p>
            ) : null}
          </div>

          {!batch.publishedAt && canPublish ? (
            <button
              className="ati-btn ati-btn--compact"
              disabled={busyKey === "publication"}
              onClick={() =>
                void mutate(
                  "publication",
                  `/api/imports/${batch.id}/publish`,
                  {},
                  "POST",
                )
              }
              type="button"
            >
              {busyKey === "publication"
                ? "Publishing…"
                : "Publish calendar"}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="approval-panel__submit">
          <div>
            <strong>
              {latest?.status === "REJECTED"
                ? "Rejected batch can be corrected and resubmitted"
                : eligible
                  ? canSubmit
                    ? "Batch is ready for submission"
                    : "Awaiting requester submission"
                  : "Batch is not ready for submission"}
            </strong>
            <span>
              {eligible
                ? canSubmit
                  ? "All blocking errors are resolved and warnings are acknowledged."
                  : "No approval request has been submitted for this batch yet."
                : "Resolve invalid rows and acknowledge every warning first."}
            </span>
            {latest?.status === "REJECTED" &&
            latest.decisionReason ? (
              <p>Last rejection: {latest.decisionReason}</p>
            ) : null}
          </div>

          {canSubmit ? (
            <button
              className="ati-btn ati-btn--compact"
              disabled={
                !eligible || busyKey === "approval-submit"
              }
              onClick={() => void submit()}
              type="button"
            >
              {busyKey === "approval-submit"
                ? "Submitting…"
                : "Submit for approval"}
            </button>
          ) : null}
        </div>
      )}

      {rejecting && pending ? (
        <div className="approval-panel__reject">
          <label>
            <span>Rejection reason</span>
            <textarea
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain what the operator must change before resubmission"
              rows={3}
              value={reason}
            />
          </label>
          <div>
            <button
              className="ati-btn ati-btn--compact ati-btn--danger-subtle"
              disabled={
                reason.trim().length < 5 ||
                busyKey === "approval-reject"
              }
              onClick={() => void decide("REJECT")}
              type="button"
            >
              Confirm rejection
            </button>
            <button
              className="ati-btn ati-btn--compact ati-btn--neutral-subtle"
              onClick={() => {
                setRejecting(false);
                setReason("");
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PublicationLineage({
  batch,
}: {
  batch: ReviewBatch;
}) {
  const [publicationPage, setPublicationPage] = useState(1);

  if (!batch.publishedAt) {
    return null;
  }

  const dateCount = batch.publishedOccurrences.reduce(
    (total, occurrence) => total + occurrence.dates.length,
    0,
  );
  const regionCount = batch.publishedOccurrences.reduce(
    (total, occurrence) =>
      total + occurrence.regionCodes.length,
    0,
  );
  const publicationPageCount = Math.max(
    1,
    Math.ceil(
      batch.publishedOccurrences.length / REVIEW_PAGE_SIZE,
    ),
  );
  const safePublicationPage = Math.min(
    publicationPage,
    publicationPageCount,
  );
  const publicationPageStart =
    (safePublicationPage - 1) * REVIEW_PAGE_SIZE;
  const publicationPageRows = batch.publishedOccurrences.slice(
    publicationPageStart,
    publicationPageStart + REVIEW_PAGE_SIZE,
  );
  const publicationPageEnd = Math.min(
    publicationPageStart + publicationPageRows.length,
    batch.publishedOccurrences.length,
  );

  return (
    <section className="ati-card publication-lineage">
      <div className="import-review-issues__header">
        <div>
          <p className="eyebrow">Canonical calendar</p>
          <h2>Published lineage</h2>
          <p>
            Each canonical occurrence points back to its governed
            source row. Day and weekday/weekend values are derived
            from expanded calendar dates, never trusted from Excel.
          </p>
        </div>
        <span className="ati-badge ati-badge--success">
          Published
        </span>
      </div>

      <dl className="import-metrics">
        <div>
          <dt>Occurrences</dt>
          <dd>{batch.publishedOccurrences.length}</dd>
        </div>
        <div>
          <dt>Region links</dt>
          <dd>{regionCount}</dd>
        </div>
        <div>
          <dt>Calendar dates</dt>
          <dd>{dateCount}</dd>
        </div>
        <div>
          <dt>Published</dt>
          <dd>{formatShortDate(batch.publishedAt)}</dd>
        </div>
      </dl>

      <div className="publication-lineage__table-wrap">
        <table className="publication-lineage__table">
          <colgroup>
            <col className="publication-lineage__col--holiday" />
            <col className="publication-lineage__col--source" />
            <col className="publication-lineage__col--regions" />
            <col className="publication-lineage__col--dates" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Holiday</th>
              <th scope="col">Source</th>
              <th scope="col">Regions</th>
              <th scope="col">Canonical dates</th>
            </tr>
          </thead>
          <tbody>
            {publicationPageRows.map((occurrence) => (
              <tr key={occurrence.id}>
                <td>
                  <div className="publication-lineage__holiday">
                    <strong>{occurrence.holidayName}</strong>
                    <span>{occurrence.calendarYear}</span>
                  </div>
                </td>
                <td>
                  <div className="publication-lineage__source">
                    <strong>
                      Source row {occurrence.sourceRowNumber}
                    </strong>
                    <span>
                      {occurrence.startDate} → {occurrence.endDate}
                    </span>
                  </div>
                </td>
                <td>
                  <div className="publication-lineage__regions">
                    {occurrence.regionCodes.map((code) => (
                      <span
                        className="region-alias-chip"
                        key={code}
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <div className="publication-lineage__dates">
                    {occurrence.dates.map((date) => (
                      <span key={date.date}>
                        {date.date} · {date.dayOfWeek} ·{" "}
                        {date.dayType}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ReviewPagination
        end={publicationPageEnd}
        label="Occurrences"
        onPageChange={setPublicationPage}
        page={safePublicationPage}
        pageCount={publicationPageCount}
        start={publicationPageStart}
        total={batch.publishedOccurrences.length}
      />
    </section>
  );
}

function StagingRows({
  batch,
  activeRegions,
  canEdit,
  busyKey,
  mutate,
}: {
  batch: ReviewBatch;
  activeRegions: RegionOption[];
  canEdit: boolean;
  busyKey?: string;
  mutate: (
    key: string,
    url: string,
    body: unknown,
  ) => Promise<boolean>;
}) {
  const [stagingPage, setStagingPage] = useState(1);
  const stagingPageCount = Math.max(
    1,
    Math.ceil(batch.rows.length / REVIEW_PAGE_SIZE),
  );
  const safeStagingPage = Math.min(
    stagingPage,
    stagingPageCount,
  );
  const stagingPageStart =
    (safeStagingPage - 1) * REVIEW_PAGE_SIZE;
  const stagingPageRows = batch.rows.slice(
    stagingPageStart,
    stagingPageStart + REVIEW_PAGE_SIZE,
  );
  const stagingPageEnd = Math.min(
    stagingPageStart + stagingPageRows.length,
    batch.rows.length,
  );

  return (
    <section
      className="ati-card import-staging"
      aria-labelledby="staging-heading"
    >
      <div className="import-review-issues__header">
        <div>
          <p className="eyebrow">Controlled staging</p>
          <h2 id="staging-heading">Normalized holiday rows</h2>
          <p>
            Raw workbook evidence never changes. Corrections update
            only normalized staging, trigger full batch revalidation,
            and are audit-recorded.
          </p>
        </div>

        {!canEdit ? (
          <span className="ati-badge ati-badge--brand">
            Read only
          </span>
        ) : null}
      </div>

      <div className="staging-row-list">
        {stagingPageRows.map((row) => (
          <StagingRowEditor
            activeRegions={activeRegions}
            batchId={batch.id}
            busyKey={busyKey}
            canEdit={canEdit}
            key={row.id}
            mutate={mutate}
            row={row}
          />
        ))}
      </div>

      <ReviewPagination
        end={stagingPageEnd}
        label="Rows"
        onPageChange={setStagingPage}
        page={safeStagingPage}
        pageCount={stagingPageCount}
        start={stagingPageStart}
        total={batch.rows.length}
      />
    </section>
  );
}

function StagingRowEditor({
  batchId,
  row,
  activeRegions,
  canEdit,
  busyKey,
  mutate,
}: {
  batchId: string;
  row: ReviewRow;
  activeRegions: RegionOption[];
  canEdit: boolean;
  busyKey?: string;
  mutate: (
    key: string,
    url: string,
    body: unknown,
  ) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [excluding, setExcluding] = useState(false);
  const [holidayName, setHolidayName] = useState(
    row.normalizedData.holidayName,
  );
  const [startDate, setStartDate] = useState(
    row.normalizedData.startDate ?? "",
  );
  const [endDate, setEndDate] = useState(
    row.normalizedData.endDate ?? "",
  );
  const [regionCodes, setRegionCodes] = useState<string[]>(
    row.normalizedData.regionCodes,
  );
  const [sourceReference, setSourceReference] = useState(
    row.normalizedData.sourceReference ?? "",
  );
  const [notes, setNotes] = useState(
    row.normalizedData.notes ?? "",
  );
  const [excludeReason, setExcludeReason] = useState(
    row.excludedReason ?? "",
  );

  const rowUrl =
    `/api/imports/${batchId}/rows/${row.id}`;

  function resetEditor() {
    setHolidayName(row.normalizedData.holidayName);
    setStartDate(row.normalizedData.startDate ?? "");
    setEndDate(row.normalizedData.endDate ?? "");
    setRegionCodes(row.normalizedData.regionCodes);
    setSourceReference(
      row.normalizedData.sourceReference ?? "",
    );
    setNotes(row.normalizedData.notes ?? "");
  }

  async function saveCorrection() {
    const saved = await mutate(
      `correct-${row.id}`,
      rowUrl,
      {
        action: "CORRECT",
        correction: {
          holidayName,
          regionCodes,
          startDate,
          endDate,
          sourceReference,
          notes,
        },
      },
    );

    if (saved) {
      setEditing(false);
    }
  }

  async function excludeRow() {
    const saved = await mutate(
      `exclude-${row.id}`,
      rowUrl,
      {
        action: "EXCLUDE",
        reason: excludeReason,
      },
    );

    if (saved) {
      setExcluding(false);
    }
  }

  return (
    <article
      className={
        row.status === "EXCLUDED"
          ? "staging-row staging-row--excluded"
          : "staging-row"
      }
    >
      <div className="staging-row__summary">
        <div className="staging-row__number">
          <span>Row</span>
          <strong>{row.sourceRowNumber}</strong>
        </div>

        <div className="staging-row__holiday">
          <strong>
            {row.normalizedData.holidayName || "Unnamed holiday"}
          </strong>
          <span>
            {row.normalizedData.startDate ?? "No start date"} →{" "}
            {row.normalizedData.endDate ?? "No end date"}
          </span>
        </div>

        <div className="staging-row__regions">
          {row.normalizedData.regionCodes.length > 0
            ? row.normalizedData.regionCodes.map((code) => (
                <span
                  className="region-alias-chip"
                  key={code}
                >
                  {code}
                </span>
              ))
            : (
              <span className="staging-row__missing">
                No resolved region
              </span>
            )}
        </div>

        <span className={rowStatusBadge(row.status)}>
          {row.status}
        </span>

        {canEdit ? (
          <div className="staging-row__actions">
            {row.status === "EXCLUDED" ? (
              <button
                className="ati-btn ati-btn--compact ati-btn--subtle"
                disabled={busyKey === `restore-${row.id}`}
                onClick={() =>
                  void mutate(
                    `restore-${row.id}`,
                    rowUrl,
                    { action: "RESTORE" },
                  )
                }
                type="button"
              >
                Restore
              </button>
            ) : (
              <>
                <button
                  className="ati-btn ati-btn--compact ati-btn--subtle"
                  onClick={() => {
                    resetEditor();
                    setExcluding(false);
                    setEditing((value) => !value);
                  }}
                  type="button"
                >
                  {editing ? "Close" : "Correct"}
                </button>
                <button
                  className="ati-btn ati-btn--compact ati-btn--danger-subtle"
                  onClick={() => {
                    setEditing(false);
                    setExcluding((value) => !value);
                  }}
                  type="button"
                >
                  Exclude
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {row.excludedReason ? (
        <p className="staging-row__reason">
          Excluded: {row.excludedReason}
        </p>
      ) : null}

      {row.editedAt ? (
        <p className="staging-row__edited">
          Last changed by {row.editedBy ?? "authorized operator"} ·{" "}
          {formatDate(row.editedAt)}
        </p>
      ) : null}

      {editing && canEdit ? (
        <div className="staging-row-editor">
          <label className="staging-field staging-field--wide">
            <span>Holiday name</span>
            <input
              maxLength={200}
              onChange={(event) =>
                setHolidayName(event.target.value)
              }
              value={holidayName}
            />
          </label>

          <label className="staging-field">
            <span>Start date</span>
            <input
              onChange={(event) =>
                setStartDate(event.target.value)
              }
              type="date"
              value={startDate}
            />
          </label>

          <label className="staging-field">
            <span>End date</span>
            <input
              onChange={(event) =>
                setEndDate(event.target.value)
              }
              type="date"
              value={endDate}
            />
          </label>

          <fieldset className="staging-region-picker">
            <legend>Canonical regions</legend>
            <div>
              {activeRegions.map((region) => {
                const checked = regionCodes.includes(
                  region.code,
                );

                return (
                  <label key={region.code}>
                    <input
                      checked={checked}
                      onChange={() =>
                        setRegionCodes((current) =>
                          checked
                            ? current.filter(
                                (code) =>
                                  code !== region.code,
                              )
                            : [...current, region.code],
                        )
                      }
                      type="checkbox"
                    />
                    <span>
                      {region.code} · {region.displayName}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="staging-field staging-field--wide">
            <span>Source reference</span>
            <input
              maxLength={500}
              onChange={(event) =>
                setSourceReference(event.target.value)
              }
              value={sourceReference}
            />
          </label>

          <label className="staging-field staging-field--wide">
            <span>Notes</span>
            <textarea
              maxLength={2000}
              onChange={(event) =>
                setNotes(event.target.value)
              }
              rows={2}
              value={notes}
            />
          </label>

          <div className="staging-row-editor__actions">
            <button
              className="ati-btn ati-btn--compact"
              disabled={
                busyKey === `correct-${row.id}` ||
                !holidayName.trim() ||
                !startDate ||
                !endDate ||
                regionCodes.length === 0
              }
              onClick={() => void saveCorrection()}
              type="button"
            >
              {busyKey === `correct-${row.id}`
                ? "Saving…"
                : "Save correction"}
            </button>
            <button
              className="ati-btn ati-btn--compact ati-btn--neutral-subtle"
              onClick={() => {
                resetEditor();
                setEditing(false);
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {excluding && canEdit ? (
        <div className="staging-exclusion">
          <label>
            <span>Exclusion reason</span>
            <input
              maxLength={500}
              onChange={(event) =>
                setExcludeReason(event.target.value)
              }
              placeholder="Why must this source row not be published?"
              value={excludeReason}
            />
          </label>
          <div>
            <button
              className="ati-btn ati-btn--compact ati-btn--danger-subtle"
              disabled={
                busyKey === `exclude-${row.id}` ||
                excludeReason.trim().length < 5
              }
              onClick={() => void excludeRow()}
              type="button"
            >
              Confirm exclusion
            </button>
            <button
              className="ati-btn ati-btn--compact ati-btn--neutral-subtle"
              onClick={() => setExcluding(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ValidationIssues({
  batch,
  canAcknowledge,
  busyKey,
  mutate,
}: {
  batch: ReviewBatch;
  canAcknowledge: boolean;
  busyKey?: string;
  mutate: (
    key: string,
    url: string,
    body: unknown,
  ) => Promise<boolean>;
}) {
  const [validationPage, setValidationPage] = useState(1);
  const validationPageCount = Math.max(
    1,
    Math.ceil(batch.issues.length / REVIEW_PAGE_SIZE),
  );
  const safeValidationPage = Math.min(
    validationPage,
    validationPageCount,
  );
  const validationPageStart =
    (safeValidationPage - 1) * REVIEW_PAGE_SIZE;
  const validationPageIssues = batch.issues.slice(
    validationPageStart,
    validationPageStart + REVIEW_PAGE_SIZE,
  );
  const validationPageEnd = Math.min(
    validationPageStart + validationPageIssues.length,
    batch.issues.length,
  );

  return (
    <section className="ati-card import-review-issues">
      <div className="import-review-issues__header">
        <div>
          <p className="eyebrow">Validation</p>
          <h2>Validation issues</h2>
          <p>
            ERROR remains blocking. WARNING requires explicit
            acknowledgement before approval. INFO is evidence only.
          </p>
        </div>
        <span className="ati-badge ati-badge--brand">
          {batch.issues.length} issues
        </span>
      </div>

      {batch.issues.length === 0 ? (
        <p className="region-empty">
          No validation issues were recorded.
        </p>
      ) : (
        <div className="import-review-issue-list">
          {validationPageIssues.map((issue) => (
            <article
              className="import-review-issue"
              key={issue.id}
            >
              <div className="import-review-issue__severity">
                <span
                  className={`issue-severity issue-severity--${issue.severity.toLowerCase()}`}
                >
                  {issue.severity}
                </span>
              </div>

              <div className="import-review-issue__body">
                <strong title={issue.errorCode}>
                  {validationIssueTitle(issue.errorCode)}
                </strong>
                <p>{issue.message}</p>
                <span>
                  {issue.sourceRowNumber
                    ? `${issue.sourceSheet ?? "Row"} · row ${issue.sourceRowNumber}`
                    : "Batch-level issue"}
                  {issue.fieldName
                    ? ` · ${validationFieldLabel(issue.fieldName)}`
                    : ""}
                </span>
              </div>

              <div className="import-review-issue__action">
                {issue.severity === "WARNING" ? (
                  issue.acknowledgedAt ? (
                    <>
                      <span className="ati-badge ati-badge--success">
                        Acknowledged
                      </span>
                      <small>
                        {issue.acknowledgedBy ??
                          "Authorized operator"}
                      </small>
                      {canAcknowledge ? (
                        <button
                          className="ati-btn ati-btn--compact ati-btn--neutral-subtle"
                          disabled={
                            busyKey === `ack-${issue.id}`
                          }
                          onClick={() =>
                            void mutate(
                              `ack-${issue.id}`,
                              `/api/imports/${batch.id}/issues/${issue.id}/acknowledgement`,
                              { acknowledged: false },
                            )
                          }
                          type="button"
                        >
                          Undo
                        </button>
                      ) : null}
                    </>
                  ) : canAcknowledge ? (
                    <button
                      className="ati-btn ati-btn--compact ati-btn--subtle"
                      disabled={
                        busyKey === `ack-${issue.id}`
                      }
                      onClick={() =>
                        void mutate(
                          `ack-${issue.id}`,
                          `/api/imports/${batch.id}/issues/${issue.id}/acknowledgement`,
                          { acknowledged: true },
                        )
                      }
                      type="button"
                    >
                      {busyKey === `ack-${issue.id}`
                        ? "Saving…"
                        : "Acknowledge"}
                    </button>
                  ) : (
                    <span className="ati-badge ati-badge--warning">
                      Review required
                    </span>
                  )
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      <ReviewPagination
        end={validationPageEnd}
        label="Issues"
        onPageChange={setValidationPage}
        page={safeValidationPage}
        pageCount={validationPageCount}
        start={validationPageStart}
        total={batch.issues.length}
      />
    </section>
  );
}

function ReviewPagination({
  label,
  page,
  pageCount,
  start,
  end,
  total,
  onPageChange,
}: {
  label: string;
  page: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <div
      className="review-pagination"
      aria-label={label + " pagination"}
    >
      <span>
        {label} {start + 1}-{end} of {total}
      </span>

      <div className="review-pagination__actions">
        <button
          className="ati-btn ati-btn--compact ati-btn--subtle"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          type="button"
        >
          Previous
        </button>

        <span>
          Page {page} of {pageCount}
        </span>

        <button
          className="ati-btn ati-btn--compact ati-btn--subtle"
          disabled={page >= pageCount}
          onClick={() =>
            onPageChange(Math.min(pageCount, page + 1))
          }
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function statusBadge(status: ReviewBatch["status"]): string {
  if (status === "VALIDATED") {
    return "ati-badge ati-badge--success";
  }

  if (status === "INVALID" || status === "FAILED") {
    return "ati-badge ati-badge--danger";
  }

  return "ati-badge ati-badge--warning";
}

function rowStatusBadge(status: ReviewRow["status"]): string {
  if (status === "VALID") {
    return "ati-badge ati-badge--success";
  }

  if (status === "INVALID") {
    return "ati-badge ati-badge--danger";
  }

  return "ati-badge ati-badge--warning";
}

function approvalBadge(status: ApprovalView["status"]): string {
  if (status === "APPROVED") {
    return "ati-badge ati-badge--success";
  }

  if (status === "REJECTED" || status === "CANCELLED") {
    return "ati-badge ati-badge--danger";
  }

  return "ati-badge ati-badge--warning";
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
