"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { mountedPath } from "@/config/app";
import type { ParsedHolidayWorkbook } from "@/imports/contracts";

const PREVIEW_PAGE_SIZE = 10;

// Deliberate exception: this preview exists only in the browser before upload.
// Persisted application lists are paginated by PostgreSQL on the server.

type ImportStatus =
  | "UPLOADED"
  | "VERIFYING"
  | "VALIDATED"
  | "INVALID"
  | "FAILED";

type ImportResult = {
  batch: {
    id: string;
    batchNumber: string;
    status: ImportStatus;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    warningCount: number;
    schemaVersion: string;
  };
  issues: ParsedHolidayWorkbook["issues"];
  truncatedIssueCount: number;
};

type PreviewAlias = {
  normalizedAlias: string;
  regionCode: string;
};

type FileIdentity = {
  name: string;
  size: number;
  lastModified: number;
};

export function ImportWorkspace({
  canUpload,
  previewRegionAliases,
}: {
  canUpload: boolean;
  previewRegionAliases: PreviewAlias[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  // FUTURE: controlled exact-duplicate reprocessing
  // const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<ParsedHolidayWorkbook>();
  const [previewFile, setPreviewFile] = useState<FileIdentity>();
  const [result, setResult] = useState<ImportResult>();

  async function previewSelectedFile() {
    const file = inputRef.current?.files?.[0];

    // FUTURE: controlled exact-duplicate reprocessing

    // setConfirmDuplicate(false);
    setError(undefined);
    setResult(undefined);
    setPreview(undefined);
    setPreviewFile(undefined);

    if (!file) return;

    setParsing(true);

    try {
      const { parseHolidayWorkbook } = await import(
        "@/imports/holiday-workbook"
      );
      const bytes = new Uint8Array(await file.arrayBuffer());
      const aliases = new Map(
        previewRegionAliases.map((entry) => [
          entry.normalizedAlias,
          entry.regionCode,
        ]),
      );

      const parsed = await parseHolidayWorkbook(bytes, {
        regionAliases: aliases,
        rejectSampleRows: true,
      });

      setPreview(parsed);
      
      setPreviewPage(1);
      setPreviewFile(identityOf(file));
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Workbook preview failed.",
      );
    } finally {
      setParsing(false);
    }
  }

    const previewPageCount = preview
    ? Math.max(1, Math.ceil(preview.rows.length / PREVIEW_PAGE_SIZE))
    : 1;
  const safePreviewPage = Math.min(previewPage, previewPageCount);
  const previewPageStart = preview
    ? (safePreviewPage - 1) * PREVIEW_PAGE_SIZE
    : 0;
  const previewPageRows = preview
    ? preview.rows.slice(
        previewPageStart,
        previewPageStart + PREVIEW_PAGE_SIZE,
      )
    : [];
  const previewPageEnd = preview
    ? Math.min(
        previewPageStart + previewPageRows.length,
        preview.rows.length,
      )
    : 0;

async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const file = inputRef.current?.files?.[0];

    if (!file || !preview || !previewFile) {
      setError("No validated workbook preview is available. Re-select the XLSX file and wait for preview validation to finish.");
      return;
    }

    if (!sameIdentity(identityOf(file), previewFile)) {
      setError(
        "The selected file changed after preview. Preview it again before submitting.",
      );
      return;
    }

    setSubmitting(true);
    setError(undefined);
    setResult(undefined);

    const formData = new FormData();
    formData.set("file", file);

    // FUTURE: controlled exact-duplicate reprocessing must be a governed/admin flow
    // if (confirmDuplicate) {
    //   formData.set("confirmDuplicate", "true");
    // }

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
        // FUTURE: the old confirmation flow used DUPLICATE_FILE_CONFIRMATION_REQUIRED
        // and setConfirmDuplicate(true). Exact duplicates now fail closed.
        if (payload.code === "EXACT_FILE_DUPLICATE") {
          // FUTURE: controlled exact-duplicate reprocessing
          // setConfirmDuplicate(true);
          setError(
            payload.error ??
            "This exact workbook was imported before. Exact duplicate files cannot be reprocessed through the normal import flow.",
          );
        } else {
          setError(payload.error ?? "Import failed.");
        }
        return;
      }

      // FUTURE: controlled exact-duplicate reprocessing

      // setConfirmDuplicate(false);
      setResult(payload);
      router.refresh();
    } catch {
      setError("Import request could not reach ATI PH.");
    } finally {
      setSubmitting(false);
    }
  }

  const previewInvalidRows =
    preview?.rows.filter((row) => row.status === "INVALID").length ?? 0;
  const previewValidRows = (preview?.rows.length ?? 0) - previewInvalidRows;
  const previewWarnings =
    preview?.issues.filter((issue) => issue.severity === "WARNING").length ??
    0;

  return (
    <>
      <section className="import-panel" aria-labelledby="import-heading">
        <div className="import-copy">
          <p className="eyebrow">Governed import</p>
          <h2 id="import-heading">Preview a public-holiday workbook</h2>
          <p>
            The browser preview is a local UX preflight. On submit, only
            the untouched XLSX is sent; ATI PH reparses and validates it
            authoritatively on the server.
          </p>
        </div>

        <form className="import-form" onSubmit={submit}>
          <label className="file-field">
            <span>XLSX workbook</span>
            <input
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={!canUpload || submitting || parsing}
              onClick={(event) => {
                event.currentTarget.value = "";
              }}
              onChange={() => void previewSelectedFile()}
              ref={inputRef}
              type="file"
            />
          </label>

          <button
            className="ati-btn"
            disabled={
              !canUpload ||
              submitting ||
              parsing ||
              !preview
            }
            type="submit"
          >
            {parsing
              ? "Reading workbook…"
              : submitting
                ? "Submitting…"
                : "Submit governed import"}
              {/* FUTURE: controlled exact-duplicate reprocessing button:
                  "Confirm duplicate import"
              */}
          </button>
        </form>

        {!canUpload ? (
          <p className="form-notice form-notice--warning">
            Read-only access. Your current ATI PH permissions do not allow
            workbook upload.
          </p>
        ) : null}

        {error ? (
          <p className="form-notice form-notice--error">{error}</p>
        ) : null}

        {preview ? (
          <div className="import-local-preview">
            <div className="import-result__heading">
              <div>
                <p className="micro-label">LOCAL PREVIEW · NOT PERSISTED</p>
                <h3>Review before submission</h3>
              </div>
              <span
                className={`ati-badge ${
                  previewInvalidRows > 0
                    ? "ati-badge--danger"
                    : "ati-badge--success"
                }`}
              >
                {previewInvalidRows > 0 ? "HAS ERRORS" : "PREVIEW READY"}
              </span>
            </div>

            <dl className="import-metrics">
              <div>
                <dt>Rows</dt>
                <dd>{preview.rows.length}</dd>
              </div>
              <div>
                <dt>Valid</dt>
                <dd>{previewValidRows}</dd>
              </div>
              <div>
                <dt>Invalid</dt>
                <dd>{previewInvalidRows}</dd>
              </div>
              <div>
                <dt>Warnings</dt>
                <dd>{previewWarnings}</dd>
              </div>
            </dl>

            <div className="import-preview-table">
              <div className="import-preview-table__head">
                <span>Row</span>
                <span>Holiday</span>
                <span>Region</span>
                <span>Period</span>
                <span>Status</span>
              </div>

              {previewPageRows.map((row) => (
                <div
                  className="import-preview-table__row"
                  key={row.sourceRowNumber}
                >
                  <span>{row.sourceRowNumber}</span>
                  <strong>
                    {row.normalizedData.holidayName || "Unnamed holiday"}
                  </strong>
                  <span>
                    {row.normalizedData.regionCodes.length > 0
                      ? row.normalizedData.regionCodes.join(", ")
                      : "Unresolved"}
                  </span>
                  <span>
                    {row.normalizedData.startDate ?? "—"} →{" "}
                    {row.normalizedData.endDate ?? "—"}
                  </span>
                  <span
                    className={`issue-severity ${
                      row.status === "VALID"
                        ? "issue-severity--info"
                        : "issue-severity--error"
                    }`}
                  >
                    {row.status}
                  </span>
                </div>
              ))}
            </div>
              {preview && preview.rows.length > PREVIEW_PAGE_SIZE ? (
                <div
                  className="import-preview-pagination"
                  aria-label="Preview pagination"
                >
                  <span>
                    Rows {previewPageStart + 1}-{previewPageEnd} of{" "}
                    {preview.rows.length}
                  </span>

                  <div className="import-preview-pagination__actions">
                    <button
                      className="ati-btn ati-btn--compact ati-btn--subtle"
                      disabled={safePreviewPage <= 1}
                      onClick={() =>
                        setPreviewPage((page) => Math.max(1, page - 1))
                      }
                      type="button"
                    >
                      Previous
                    </button>

                    <span>
                      Page {safePreviewPage} of {previewPageCount}
                    </span>

                    <button
                      className="ati-btn ati-btn--compact ati-btn--subtle"
                      disabled={safePreviewPage >= previewPageCount}
                      onClick={() =>
                        setPreviewPage((page) =>
                          Math.min(previewPageCount, page + 1),
                        )
                      }
                      type="button"
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}

            {preview.issues.length > 0 ? (
              <ul className="issue-list">
                {preview.issues.slice(0, 8).map((issue, index) => (
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

            <p className="result-footnote">
              Local preview data is never persisted as authority. On
              submission ATI PH sends only the raw XLSX, parses it once on the
              server, and persists rows and issues from that authoritative
              result.
            </p>
          </div>
        ) : null}

        {result ? (
          <div className="import-result" aria-live="polite">
            <div className="import-result__heading">
              <div>
                <p className="micro-label">{result.batch.batchNumber}</p>
                <h3>Authoritative validation complete</h3>
              </div>
              <span
                className={
                  result.batch.status === "INVALID"
                    ? "ati-badge ati-badge--danger"
                    : "ati-badge ati-badge--success"
                }
              >
                {result.batch.status}
              </span>
            </div>

            <p className="result-footnote">
              {result.batch.status === "INVALID"
                ? "The server persisted this workbook as governed INVALID staging. Raw evidence and authoritative issues are retained so the batch can be corrected or explicitly excluded before approval."
                : "The accepted batch was created from the authoritative server parse. Raw evidence is immutable and approval can operate on the persisted validated staging state."}
            </p>
          </div>
        ) : null}
      </section>



    </>
  );
}

function identityOf(file: File): FileIdentity {
  return {
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
  };
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return (
    left.name === right.name &&
    left.size === right.size &&
    left.lastModified === right.lastModified
  );
}
