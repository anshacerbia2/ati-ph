"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { mountedPath } from "@/config/app";

type ImportIssue = {
  severity: "ERROR" | "WARNING" | "INFO";
  code: string;
  message: string;
  sourceRowNumber?: number;
};

type ImportResult = {
  batch: {
    id: string;
    batchNumber: string;
    status: "VALIDATED" | "INVALID";
    totalRows: number;
    validRows: number;
    invalidRows: number;
    warningCount: number;
    schemaVersion: string;
  };
  issues: ImportIssue[];
  truncatedIssueCount: number;
};

type RecentImport = {
  id: string;
  batchNumber: string;
  sourceName: string;
  status: "UPLOADED" | "VALIDATED" | "INVALID" | "FAILED";
  totalRows: number;
  invalidRows: number;
  warningCount: number;
  uploadedAt: string;
  uploadedBy: {
    email: string;
    displayName: string | null;
  };
};

export function ImportWorkspace({
  canUpload,
  recentImports,
}: {
  canUpload: boolean;
  recentImports: RecentImport[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<ImportResult>();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];

    if (!file) {
      setError("Choose an XLSX workbook first.");
      return;
    }

    setSubmitting(true);
    setError(undefined);
    setResult(undefined);

    const formData = new FormData();
    formData.set("file", file);

    if (confirmDuplicate) {
      formData.set("confirmDuplicate", "true");
    }

    try {
      const response = await fetch(mountedPath("/api/imports"), {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as ImportResult & {
        error?: string;
        code?: string;
      };

      if (!response.ok) {
        if (
          payload.code ===
          "DUPLICATE_FILE_CONFIRMATION_REQUIRED"
        ) {
          setConfirmDuplicate(true);
          setError(
            `${payload.error} Submit again to explicitly reprocess it.`,
          );
        } else {
          setError(payload.error ?? "Import failed.");
        }
        return;
      }

      setConfirmDuplicate(false);
      setResult(payload);
      router.refresh();
    } catch {
      setError("Import request could not reach ATI PH.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section
        className="import-panel"
        aria-labelledby="import-heading"
      >
        <div className="import-copy">
          <p className="eyebrow">Governed import</p>
          <h2 id="import-heading">
            Stage a public-holiday workbook
          </h2>
          <p>
            Upload keeps the original file immutable, maps the legacy
            Holiday_Master sheet, and validates every row before
            canonical publication is possible.
          </p>
        </div>

        <form className="import-form" onSubmit={submit}>
          <label className="file-field">
            <span>XLSX workbook</span>
            <input
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={!canUpload || submitting}
              onChange={() => {
                setConfirmDuplicate(false);
                setError(undefined);
                setResult(undefined);
              }}
              ref={inputRef}
              type="file"
            />
          </label>

          <button
            className="ati-btn"
            disabled={!canUpload || submitting}
            type="submit"
          >
            {submitting
              ? "Validating…"
              : confirmDuplicate
                ? "Confirm duplicate import"
                : "Upload and validate"}
          </button>
        </form>

        {!canUpload ? (
          <p className="form-notice form-notice--warning">
            Read-only access. Your current ATI PH permissions do not
            allow workbook upload.
          </p>
        ) : null}

        {error ? (
          <p className="form-notice form-notice--error">
            {error}
          </p>
        ) : null}

        {result ? <ImportResultCard result={result} /> : null}
      </section>

      <RecentImports imports={recentImports} />
    </>
  );
}

function ImportResultCard({
  result,
}: {
  result: ImportResult;
}) {
  return (
    <div className="import-result" aria-live="polite">
      <div className="import-result__heading">
        <div>
          <p className="micro-label">
            {result.batch.batchNumber}
          </p>
          <h3>
            {result.batch.status === "VALIDATED"
              ? "Ready for review"
              : "Validation blocked"}
          </h3>
        </div>

        <span
          className={
            result.batch.status === "VALIDATED"
              ? "ati-badge ati-badge--success"
              : "ati-badge ati-badge--danger"
          }
        >
          {result.batch.status}
        </span>
      </div>

      <dl className="import-metrics">
        <div>
          <dt>Rows</dt>
          <dd>{result.batch.totalRows}</dd>
        </div>
        <div>
          <dt>Valid</dt>
          <dd>{result.batch.validRows}</dd>
        </div>
        <div>
          <dt>Invalid</dt>
          <dd>{result.batch.invalidRows}</dd>
        </div>
        <div>
          <dt>Warnings</dt>
          <dd>{result.batch.warningCount}</dd>
        </div>
      </dl>

      {result.issues.length > 0 ? (
        <ul className="issue-list">
          {result.issues.slice(0, 8).map((issue, index) => (
            <li
              key={`${issue.code}-${issue.sourceRowNumber ?? "batch"}-${index}`}
            >
              <span
                className={`issue-severity issue-severity--${issue.severity.toLowerCase()}`}
              >
                {issue.severity}
              </span>
              <span>
                {issue.sourceRowNumber
                  ? `Row ${issue.sourceRowNumber}: `
                  : ""}
                {issue.message}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {result.issues.length > 8 ||
      result.truncatedIssueCount > 0 ? (
        <p className="result-footnote">
          Showing the first 8 issues. Download the full validation
          report for complete evidence.
        </p>
      ) : null}

      <DownloadActions
        batchId={result.batch.id}
        sourceName="Original workbook"
      />
    </div>
  );
}

function RecentImports({
  imports,
}: {
  imports: RecentImport[];
}) {
  return (
    <section
      className="ati-card import-history"
      aria-labelledby="recent-imports-heading"
    >
      <div className="import-history__header">
        <div>
          <p className="eyebrow">Evidence</p>
          <h2 id="recent-imports-heading">
            Recent imports
          </h2>
          <p>
            Download the complete validation report or the exact
            immutable workbook bytes registered for each batch.
          </p>
        </div>

        <span className="ati-badge ati-badge--brand">
          Last {imports.length}
        </span>
      </div>

      {imports.length === 0 ? (
        <p className="region-empty">
          No import batches have been created yet.
        </p>
      ) : (
        <div className="import-history__list">
          {imports.map((batch) => (
            <article
              className="import-history-row"
              key={batch.id}
            >
              <div className="import-history-row__identity">
                <strong>{batch.sourceName}</strong>
                <span>
                  {batch.batchNumber} ·{" "}
                  {formatUploadedAt(batch.uploadedAt)}
                </span>
              </div>

              <div className="import-history-row__metrics">
                <span>{batch.totalRows} rows</span>
                <span>{batch.invalidRows} invalid</span>
                <span>{batch.warningCount} warnings</span>
              </div>

              <span className={statusBadge(batch.status)}>
                {batch.status}
              </span>

              <div className="import-history-row__actions">
                <a
                  className="ati-btn ati-btn--compact ati-btn--subtle"
                  href={mountedPath(`/imports/${batch.id}`)}
                >
                  Review
                </a>
                <DownloadActions
                  batchId={batch.id}
                  sourceName={batch.sourceName}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function DownloadActions({
  batchId,
  sourceName,
}: {
  batchId: string;
  sourceName: string;
}) {
  return (
    <div className="import-download-actions">
      <a
        className="ati-btn ati-btn--compact ati-btn--subtle"
        href={mountedPath(
          `/api/imports/${batchId}/validation-report`,
        )}
      >
        Validation report
      </a>

      <a
        className="ati-btn ati-btn--compact ati-btn--neutral-subtle"
        href={mountedPath(`/api/imports/${batchId}/raw`)}
        title={`Download ${sourceName}`}
      >
        Original workbook
      </a>
    </div>
  );
}

function statusBadge(status: RecentImport["status"]): string {
  if (status === "VALIDATED") {
    return "ati-badge ati-badge--success";
  }

  if (status === "INVALID" || status === "FAILED") {
    return "ati-badge ati-badge--danger";
  }

  return "ati-badge ati-badge--warning";
}

function formatUploadedAt(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
