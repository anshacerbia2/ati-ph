import { mountedPath } from "@/config/app";
import { DataPagination } from "@/components/ui/DataPagination";
import type { PaginationMeta } from "@/lib/pagination";

type ImportStatus =
  | "UPLOADED"
  | "VERIFYING"
  | "VALIDATED"
  | "INVALID"
  | "FAILED";

export type RecentImport = {
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

export function RecentImportsTable({
  recentImports,
  pagination,
}: {
  recentImports: RecentImport[];
  pagination: PaginationMeta;
}) {
  return (
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
          TOTAL {pagination.total}
        </span>
      </div>

      {pagination.total === 0 ? (
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
                {recentImports.map((batch) => (
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
                          {formatDate(batch.uploadedAt)}
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

          <DataPagination
            label="Imports"
            pagination={pagination}
          />
        </>
      )}
    </section>
  );
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
