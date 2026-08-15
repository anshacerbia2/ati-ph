"use client";

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

export function ImportWorkspace({ canUpload }: { canUpload: boolean }) {
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
        if (payload.code === "DUPLICATE_FILE_CONFIRMATION_REQUIRED") {
          setConfirmDuplicate(true);
          setError(`${payload.error} Submit again to explicitly reprocess it.`);
        } else {
          setError(payload.error ?? "Import failed.");
        }
        return;
      }
      setConfirmDuplicate(false);
      setResult(payload);
    } catch {
      setError("Import request could not reach ATI PH.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="import-panel" aria-labelledby="import-heading">
      <div className="import-copy">
        <p className="eyebrow">Governed import</p>
        <h2 id="import-heading">Stage a public-holiday workbook</h2>
        <p>
          Upload keeps the original file immutable, maps the legacy Holiday_Master
          sheet, and validates every row before canonical publication is possible.
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
        <button className="ati-btn" disabled={!canUpload || submitting} type="submit">
          {submitting
            ? "Validating…"
            : confirmDuplicate
              ? "Confirm duplicate import"
              : "Upload and validate"}
        </button>
      </form>

      {!canUpload ? (
        <p className="form-notice form-notice--warning">
          Read-only access. Operator or Administrator role is required to upload.
        </p>
      ) : null}
      {error ? <p className="form-notice form-notice--error">{error}</p> : null}

      {result ? (
        <div className="import-result" aria-live="polite">
          <div className="import-result__heading">
            <div>
              <p className="micro-label">{result.batch.batchNumber}</p>
              <h3>{result.batch.status === "VALIDATED" ? "Ready for review" : "Validation blocked"}</h3>
            </div>
            <span
              className={`ati-badge ${result.batch.status === "VALIDATED" ? "ati-badge--success" : "ati-badge--danger"}`}
            >
              {result.batch.status}
            </span>
          </div>
          <dl className="import-metrics">
            <div><dt>Rows</dt><dd>{result.batch.totalRows}</dd></div>
            <div><dt>Valid</dt><dd>{result.batch.validRows}</dd></div>
            <div><dt>Invalid</dt><dd>{result.batch.invalidRows}</dd></div>
            <div><dt>Warnings</dt><dd>{result.batch.warningCount}</dd></div>
          </dl>
          {result.issues.length > 0 ? (
            <ul className="issue-list">
              {result.issues.slice(0, 8).map((issue, index) => (
                <li key={`${issue.code}-${issue.sourceRowNumber ?? "batch"}-${index}`}>
                  <span className={`issue-severity issue-severity--${issue.severity.toLowerCase()}`}>
                    {issue.severity}
                  </span>
                  <span>
                    {issue.sourceRowNumber ? `Row ${issue.sourceRowNumber}: ` : ""}
                    {issue.message}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {result.issues.length > 8 || result.truncatedIssueCount > 0 ? (
            <p className="result-footnote">
              Showing the first 8 issues. Full report remains attached to the batch.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
