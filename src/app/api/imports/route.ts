import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import path from "node:path";

import { Prisma } from "@prisma/client";

import {
  removeUnregisteredArtifact,
  storeImmutableArtifact,
} from "@/artifacts/local-storage";
import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import { computeBusinessContentSha256 } from "@/imports/business-content";
import {
  parseHolidayWorkbook,
  WorkbookContractError,
} from "@/imports/holiday-workbook";
import { assertSafeXlsxPackage } from "@/imports/xlsx-safety";
import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type DuplicateImport = {
  id: string;
  batchNumber: string;
  status: string;
  uploadedAt: Date;
};

class ConcurrentExactDuplicateError extends Error {
  readonly duplicate: DuplicateImport;

  constructor(duplicate: DuplicateImport) {
    super("EXACT_FILE_DUPLICATE");
    this.name = "ConcurrentExactDuplicateError";
    this.duplicate = duplicate;
  }
}

class ConcurrentBusinessDuplicateError extends Error {
  readonly duplicate: DuplicateImport;

  constructor(duplicate: DuplicateImport) {
    super("SAME_HOLIDAY_DATA");
    this.name = "ConcurrentBusinessDuplicateError";
    this.duplicate = duplicate;
  }
}

export async function POST(request: Request): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.IMPORT_CREATE);
  if (!access.ok) {
    return access.response;
  }

  const { session } = access;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError(
      400,
      "INVALID_UPLOAD_REQUEST",
      "The upload request could not be read. Re-select the workbook and try again.",
    );
  }

  const upload = formData.get("file");

  if (!(upload instanceof File)) {
    return apiError(
      400,
      "WORKBOOK_REQUIRED",
      "Select an XLSX workbook before submitting.",
    );
  }

  const env = getServerEnv();

  if (upload.size === 0) {
    return apiError(
      400,
      "EMPTY_WORKBOOK",
      "The selected workbook is empty.",
    );
  }

  if (upload.size > env.IMPORT_MAX_FILE_SIZE_BYTES) {
    return apiError(
      413,
      "WORKBOOK_TOO_LARGE",
      `The selected workbook exceeds the ${env.IMPORT_MAX_FILE_SIZE_BYTES}-byte upload limit.`,
    );
  }

  const safeFileName = sanitizeFileName(upload.name);

  if (path.extname(safeFileName).toLowerCase() !== ".xlsx") {
    return apiError(
      415,
      "UNSUPPORTED_FILE_TYPE",
      "Select a supported .xlsx workbook.",
    );
  }

  if (
    upload.type &&
    upload.type !== XLSX_MIME &&
    upload.type !== "application/octet-stream"
  ) {
    return apiError(
      415,
      "UNSUPPORTED_FILE_TYPE",
      "The selected file is not a supported XLSX workbook.",
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await upload.arrayBuffer());
  } catch {
    return apiError(
      400,
      "WORKBOOK_READ_FAILED",
      "The selected workbook could not be read. Re-select it and try again.",
    );
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const duplicate = await findExactDuplicate(db, sha256);
  if (duplicate) {
    return exactDuplicateResponse(duplicate);
  }

  let authoritativePreview: Awaited<
    ReturnType<typeof parseHolidayWorkbook>
  >;

  try {
    await assertSafeXlsxPackage(bytes);

    const activeAliases = await db.calendarRegionAlias.findMany({
      where: {
        isActive: true,
        region: { isActive: true },
      },
      select: {
        normalizedAlias: true,
        region: {
          select: { code: true },
        },
      },
    });

    if (activeAliases.length === 0) {
      return apiError(
        503,
        "CALENDAR_REGION_REGISTRY_UNAVAILABLE",
        "ATI PH has no active calendar-region aliases. The workbook was not imported.",
      );
    }

    authoritativePreview = await parseHolidayWorkbook(bytes, {
      regionAliases: new Map(
        activeAliases.map((entry) => [
          entry.normalizedAlias,
          entry.region.code,
        ]),
      ),
      rejectSampleRows: true,
    });
  } catch (error) {
    if (error instanceof WorkbookContractError) {
      return apiError(
        422,
        "WORKBOOK_SERVER_VALIDATION_FAILED",
        "The workbook could not pass authoritative server-side XLSX validation. Review the workbook and try again.",
      );
    }

    console.error("ATI PH authoritative workbook parsing failed.", error);
    return apiError(
      500,
      "WORKBOOK_SERVER_VALIDATION_FAILED",
      "ATI PH could not authoritatively parse the workbook. No import was created.",
    );
  }

  if (authoritativePreview.rows.length === 0) {
    return apiError(
      422,
      "NO_HOLIDAY_ROWS",
      "No holiday rows were found in Holiday_Master.",
    );
  }

  const initialStatus = hasBlockingErrors(authoritativePreview)
    ? "INVALID"
    : "VALIDATED";

  const businessContentSha256 = computeBusinessContentSha256(
    authoritativePreview.rows,
  );

  if (businessContentSha256) {
    const businessDuplicate = await findBusinessDuplicate(
      db,
      businessContentSha256,
    );
    if (businessDuplicate) {
      return sameHolidayDataResponse(businessDuplicate);
    }
  }

  // FUTURE: controlled reprocessing of exact or semantically identical
  // Holiday_Master content must be a separate governed/admin recovery flow.
  // Normal imports fail closed on either duplicate identity.
  const artifactId = randomUUID();
  const batchId = randomUUID();
  const now = new Date();
  const storageKey = storageKeyFor(now, artifactId);
  const batchNumber = makeBatchNumber(now);

  const rowIds = new Map<number, string>(
    authoritativePreview.rows.map((row) => [
      row.sourceRowNumber,
      randomUUID(),
    ]),
  );

  const totalRows = authoritativePreview.rows.length;
  const invalidRows = authoritativePreview.rows.filter(
    (row) => row.status === "INVALID",
  ).length;
  const validRows = totalRows - invalidRows;
  const warningCount = authoritativePreview.issues.filter(
    (issue) => issue.severity === "WARNING",
  ).length;

  try {
    await storeImmutableArtifact(storageKey, bytes);
  } catch (error) {
    await removeUnregisteredArtifact(storageKey).catch(() => undefined);
    console.error("ATI PH raw import artifact storage failed.", error);

    return apiError(
      500,
      "ARTIFACT_STORAGE_FAILED",
      "The workbook could not be stored safely. No import was created.",
    );
  }

  try {
    await db.$transaction(async (transaction) => {
      const duplicateLockHash = businessContentSha256 ?? sha256;
      const [lockKeyA, lockKeyB] =
        advisoryLockKeys(duplicateLockHash);

      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(
          ${lockKeyA}::integer,
          ${lockKeyB}::integer
        )
      `;

      const concurrentDuplicate = await findExactDuplicate(
        transaction,
        sha256,
      );
      if (concurrentDuplicate) {
        throw new ConcurrentExactDuplicateError(
          concurrentDuplicate,
        );
      }

      if (businessContentSha256) {
        const concurrentBusinessDuplicate =
          await findBusinessDuplicate(
            transaction,
            businessContentSha256,
          );

        if (concurrentBusinessDuplicate) {
          throw new ConcurrentBusinessDuplicateError(
            concurrentBusinessDuplicate,
          );
        }
      }

      await transaction.fileArtifact.create({
        data: {
          id: artifactId,
          artifactType: "RAW_IMPORT",
          fileName: safeFileName,
          mimeType: XLSX_MIME,
          sizeBytes: BigInt(bytes.byteLength),
          sha256,
          storageProvider: "LOCAL",
          storageKey,
          retentionClass: "RAW_IMPORT_EVIDENCE",
          createdById: session.user.id,
        },
      });

      await transaction.importBatch.create({
        data: {
          id: batchId,
          batchNumber,
          sourceName: safeFileName,
          schemaName: authoritativePreview.schemaName,
          schemaVersion: authoritativePreview.schemaVersion,
          rawArtifactId: artifactId,
          fileSha256: sha256,
          businessContentSha256,
          columnMapping: asJson(
            authoritativePreview.columnMapping,
          ),
          status: initialStatus,
          totalRows,
          validRows,
          invalidRows,
          warningCount,
          uploadedById: session.user.id,
          validatedAt: now,
        },
      });

      await transaction.importRow.createMany({
        data: authoritativePreview.rows.map((row) => ({
          id: rowIds.get(row.sourceRowNumber)!,
          importBatchId: batchId,
          sourceSheet: row.sourceSheet,
          sourceRowNumber: row.sourceRowNumber,
          revisionId: rowIds.get(row.sourceRowNumber)!,
          rawData: asJson(row.rawData),
          normalizedData: asJson(row.normalizedData),
          status: row.status,
        })),
      });

      if (authoritativePreview.issues.length > 0) {
        await transaction.importValidationIssue.createMany({
          data: authoritativePreview.issues.map((issue) => ({
            id: randomUUID(),
            importBatchId: batchId,
            importRowId: issue.sourceRowNumber
              ? rowIds.get(issue.sourceRowNumber)
              : undefined,
            severity: issue.severity,
            errorCode: issue.code,
            fieldName: issue.fieldName,
            rejectedValue: issue.rejectedValue,
            message: issue.message,
          })),
        });
      }

      await transaction.auditEvent.create({
        data: {
          userId: session.user.id,
          action:
            initialStatus === "VALIDATED"
              ? "IMPORT_WORKBOOK_VALIDATED"
              : "IMPORT_WORKBOOK_INVALID",
          entityType: "ImportBatch",
          entityId: batchId,
          metadata: {
            batchNumber,
            schemaVersion: authoritativePreview.schemaVersion,
            authority: "SERVER_XLSX_PARSE",
            status: initialStatus,
            totalRows,
            validRows,
            invalidRows,
            warningCount,
            fileSha256: sha256,
            businessContentSha256,
            validatedAt: now.toISOString(),
          },
        },
      });

      if (initialStatus === "VALIDATED") {
        await transaction.outboxEvent.create({
          data: {
            topic: "ImportBatchValidated",
            aggregateType: "ImportBatch",
            aggregateId: batchId,
            payload: {
              eventVersion: 1,
              importBatchId: batchId,
              occurredAt: now.toISOString(),
            },
          },
        });
      }
    });
  } catch (error) {
    await removeUnregisteredArtifact(storageKey).catch(
      () => undefined,
    );

    if (error instanceof ConcurrentExactDuplicateError) {
      return exactDuplicateResponse(error.duplicate);
    }

    if (error instanceof ConcurrentBusinessDuplicateError) {
      return sameHolidayDataResponse(error.duplicate);
    }

    console.error(
      "ATI PH authoritative import staging failed.",
      error,
    );

    return apiError(
      500,
      "IMPORT_STAGING_FAILED",
      "The workbook could not be staged from the authoritative server parse. No import was created.",
    );
  }

  return Response.json(
    {
      batch: {
        id: batchId,
        batchNumber,
        status: initialStatus,
        totalRows,
        validRows,
        invalidRows,
        warningCount,
        schemaVersion: authoritativePreview.schemaVersion,
      },
      issues: authoritativePreview.issues.slice(0, 50),
      truncatedIssueCount: Math.max(
        0,
        authoritativePreview.issues.length - 50,
      ),
      authoritative: true,
    },
    { status: 201 },
  );
}

function hasBlockingErrors(
  preview: Awaited<ReturnType<typeof parseHolidayWorkbook>>,
): boolean {
  return (
    preview.rows.some((row) => row.status === "INVALID") ||
    preview.issues.some((issue) => issue.severity === "ERROR")
  );
}

function apiError(
  status: number,
  code: string,
  error: string,
): Response {
  return Response.json({ code, error }, { status });
}

function exactDuplicateResponse(
  duplicate: DuplicateImport,
): Response {
  return Response.json(
    {
      code: "EXACT_FILE_DUPLICATE",
      error:
        `This workbook was already imported as ${duplicate.batchNumber}. ` +
        "No new import was created. Upload a revised workbook only if the source data has changed.",
      duplicate,
    },
    { status: 409 },
  );
}

function sameHolidayDataResponse(
  duplicate: DuplicateImport,
): Response {
  return Response.json(
    {
      code: "SAME_HOLIDAY_DATA",
      error:
        `The Holiday_Master data was already imported as ${duplicate.batchNumber}. ` +
        "No new import was created. Workbook metadata, filename, formatting, and unrelated sheets do not create a new holiday dataset.",
      duplicate,
    },
    { status: 409 },
  );
}

type ImportBatchLookup = Pick<
  Prisma.TransactionClient,
  "importBatch"
>;

function findExactDuplicate(
  client: ImportBatchLookup,
  sha256: string,
): Promise<DuplicateImport | null> {
  return client.importBatch.findFirst({
    where: { fileSha256: sha256 },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      batchNumber: true,
      status: true,
      uploadedAt: true,
    },
  });
}

function findBusinessDuplicate(
  client: ImportBatchLookup,
  businessContentSha256: string,
): Promise<DuplicateImport | null> {
  return client.importBatch.findFirst({
    where: {
      businessContentSha256,
      status: "VALIDATED",
    },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      batchNumber: true,
      status: true,
      uploadedAt: true,
    },
  });
}

function advisoryLockKeys(sha256: string): [number, number] {
  return [
    Number.parseInt(sha256.slice(0, 8), 16) | 0,
    Number.parseInt(sha256.slice(8, 16), 16) | 0,
  ];
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value),
  ) as Prisma.InputJsonValue;
}

function sanitizeFileName(value: string): string {
  const baseName = path
    .basename(value)
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "_")
    .trim();

  return (baseName || "holiday-import.xlsx").slice(0, 200);
}

function storageKeyFor(
  date: Date,
  artifactId: string,
): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `raw-imports/${year}/${month}/${artifactId}.xlsx`;
}

function makeBatchNumber(date: Date): string {
  const day = date
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
  return `PH-${day}-${randomBytes(4).toString("hex").toUpperCase()}`;
}
