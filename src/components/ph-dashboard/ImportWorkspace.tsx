"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { mountedPath } from "@/config/app";
import type { ParsedHolidayWorkbook } from "@/imports/contracts";

const PREVIEW_PAGE_SIZE = 10;
const RECENT_IMPORT_PAGE_SIZE = 10;

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
  verificationPending: boolean;
};

type RecentImport = {
  id: string;
  batchNumber: string;
  sourceName: string;
  status: ImportStatus;
  approvalStatus:
    | "NOT_SUBMITTED"
    | "PENDING"
    | "APPROVED"
    | "REJECTED"
    | "CANCELLED";
  publishedAt: string | null;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningCount: number;
  uploadedAt: string;
  uploadedBy: string;
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
  recentImports,
  previewRegionAliases,
}: {
  canUpload: boolean;
  recentImports: RecentImport[];
  previewRegionAliases: PreviewAlias[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [recentPage, setRecentPage] = useState(1);
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
  const recentPageCount = Math.max(
    1,
    Math.ceil(recentImports.length / RECENT_IMPORT_PAGE_SIZE),
  );
  const safeRecentPage = Math.min(recentPage, recentPageCount);
  const recentPageStart =
    (safeRecentPage - 1) * RECENT_IMPORT_PAGE_SIZE;
  const recentPageRows = recentImports.slice(
    recentPageStart,
    recentPageStart + RECENT_IMPORT_PAGE_SIZE,
  );
  const recentPageEnd = Math.min(
    recentPageStart + recentPageRows.length,
    recentImports.length,
  );

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

    if (previewHasBlockingErrors(preview)) {
      setError(
        "Resolve all blocking validation errors before submitting this workbook.",
      );
      return;
    }

    setSubmitting(true);
    setError(undefined);
    setResult(undefined);

    const formData = new FormData();
    formData.set("file", file);
    formData.set("preview", JSON.stringify(preview));

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
            The browser parses and normalizes Holiday_Master first. Nothing
            is sent to ATI PH until you confirm the preview.
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
              !preview ||
              previewHasBlockingErrors(preview)
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
              After submission the raw XLSX is stored immutably. The worker
              reparses it server-side and compares a SHA-256 preview
              fingerprint before the batch can become authoritative.
            </p>
          </div>
        ) : null}

        {result ? (
          <div className="import-result" aria-live="polite">
            <div className="import-result__heading">
              <div>
                <p className="micro-label">{result.batch.batchNumber}</p>
                <h3>Server verification queued</h3>
              </div>
              <span className="ati-badge ati-badge--warning">
                {result.batch.status}
              </span>
            </div>

            <p className="result-footnote">
              Submission is persisted, but the client preview is not
              authoritative. Approval remains blocked until the worker
              verifies the stored raw workbook.
            </p>
          </div>
        ) : null}
      </section>

      <section className="ati-card import-history">
        <div className="import-history__header">
          <div>
            <p className="eyebrow">Evidence</p>
            <h2>Recent imports</h2>
            <p>
              Verification, approval, publication, and immutable source
              evidence remain visible as separate lifecycle states.
            </p>
          </div>
          <span className="ati-badge ati-badge--brand">
            LAST {recentImports.length}
          </span>
        </div>

        {recentImports.length === 0 ? (
          <p className="region-empty">
            No import batches have been created yet.
          </p>
        ) : (
          <>
            <div className="import-history-table-wrap">
              <table className="import-history-table">
                <colgroup>
                  <col className="import-history-col--batch" />
                  <col className="import-history-col--workbook" />
                  <col className="import-history-col--evidence" />
                  <col className="import-history-col--uploaded" />
                  <col className="import-history-col--status" />
                  <col className="import-history-col--approval" />
                  <col className="import-history-col--publication" />
                  <col className="import-history-col--actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Batch</th>
                    <th scope="col">Workbook</th>
                    <th scope="col">Evidence</th>
                    <th scope="col">Uploaded</th>
                    <th scope="col">Import status</th>
                    <th scope="col">Approval</th>
                    <th scope="col">Publication</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPageRows.map((batch) => (
                    <tr key={batch.id}>
                      <td>
                        <strong className="import-history-table__batch">
                          {batch.batchNumber}
                        </strong>
                      </td>
                      <td>
                        <span
                          className="import-history-table__workbook"
                          title={batch.sourceName}
                        >
                          {batch.sourceName}
                        </span>
                      </td>
                      <td>
                        <div className="import-history-table__evidence">
                          <strong>{batch.totalRows} rows</strong>
                          <span>
                            {batch.invalidRows} invalid ·{" "}
                            {batch.warningCount} warnings
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="import-history-table__uploaded">
                          <strong>
                            {new Intl.DateTimeFormat("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }).format(new Date(batch.uploadedAt))}
                          </strong>
                          <span>{batch.uploadedBy}</span>
                        </div>
                      </td>
                      <td>
                        <span className={statusBadge(batch.status)}>
                          {batch.status}
                        </span>
                      </td>
                      <td>
                        <span
                          className={approvalStatusBadge(
                            batch.approvalStatus,
                          )}
                        >
                          {approvalStatusLabel(batch.approvalStatus)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            batch.publishedAt
                              ? "ati-badge ati-badge--success"
                              : "ati-badge ati-badge--brand"
                          }
                        >
                          {batch.publishedAt
                            ? "PUBLISHED"
                            : "NOT PUBLISHED"}
                        </span>
                      </td>
                      <td>
                        <div className="import-history-table__actions">
                          <a
                            className="ati-btn ati-btn--compact ati-btn--subtle"
                            href={mountedPath(`/imports/${batch.id}`)}
                          >
                            Review
                          </a>
                          <a
                            className="ati-btn ati-btn--compact ati-btn--subtle"
                            href={mountedPath(
                              `/api/imports/${batch.id}/validation-report`,
                            )}
                          >
                            Report
                          </a>
                          <a
                            className="ati-btn ati-btn--compact ati-btn--neutral-subtle"
                            href={mountedPath(
                              `/api/imports/${batch.id}/raw`,
                            )}
                            title={`Download ${batch.sourceName}`}
                          >
                            XLSX
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {recentImports.length > RECENT_IMPORT_PAGE_SIZE ? (
              <div
                className="import-history-pagination"
                aria-label="Recent imports pagination"
              >
                <span>
                  Imports {recentPageStart + 1}-{recentPageEnd} of{" "}
                  {recentImports.length}
                </span>

                <div className="import-history-pagination__actions">
                  <button
                    className="ati-btn ati-btn--compact ati-btn--subtle"
                    disabled={safeRecentPage <= 1}
                    onClick={() =>
                      setRecentPage((page) => Math.max(1, page - 1))
                    }
                    type="button"
                  >
                    Previous
                  </button>

                  <span>
                    Page {safeRecentPage} of {recentPageCount}
                  </span>

                  <button
                    className="ati-btn ati-btn--compact ati-btn--subtle"
                    disabled={safeRecentPage >= recentPageCount}
                    onClick={() =>
                      setRecentPage((page) =>
                        Math.min(recentPageCount, page + 1),
                      )
                    }
                    type="button"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}

function previewHasBlockingErrors(
  preview: ParsedHolidayWorkbook | undefined,
): boolean {
  if (!preview) {
    return true;
  }

  return (
    preview.rows.some(
      (row) => row.status === "INVALID",
    ) ||
    preview.issues.some(
      (issue) => issue.severity === "ERROR",
    )
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

function approvalStatusLabel(
  status: RecentImport["approvalStatus"],
): string {
  return status === "NOT_SUBMITTED"
    ? "NOT SUBMITTED"
    : status;
}

function approvalStatusBadge(
  status: RecentImport["approvalStatus"],
): string {
  if (status === "APPROVED") {
    return "ati-badge ati-badge--success";
  }

  if (status === "REJECTED" || status === "CANCELLED") {
    return "ati-badge ati-badge--danger";
  }

  if (status === "PENDING") {
    return "ati-badge ati-badge--warning";
  }

  return "ati-badge ati-badge--brand";
}

function statusBadge(status: ImportStatus): string {
  if (status === "VALIDATED") {
    return "ati-badge ati-badge--success";
  }

  if (status === "INVALID" || status === "FAILED") {
    return "ati-badge ati-badge--danger";
  }

  return "ati-badge ati-badge--warning";
}

