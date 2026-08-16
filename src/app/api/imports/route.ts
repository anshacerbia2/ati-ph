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
import { parseClientPreviewJson } from "@/imports/client-preview";
import { computePreviewSha256 } from "@/imports/preview-integrity";
import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_PREVIEW_JSON_BYTES = 8_000_000;

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
    return Response.json(
      { error: "Expected a multipart upload." },
      { status: 400 },
    );
  }

  const upload = formData.get("file");
  const previewText = formData.get("preview");

  if (!(upload instanceof File)) {
    return Response.json(
      { error: "XLSX file is required." },
      { status: 400 },
    );
  }

  if (
    typeof previewText !== "string" ||
    previewText.length === 0 ||
    Buffer.byteLength(previewText, "utf8") > MAX_PREVIEW_JSON_BYTES
  ) {
    return Response.json(
      { error: "A valid client preview payload is required." },
      { status: 400 },
    );
  }

  let preview;
  try {
    preview = parseClientPreviewJson(previewText);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Client preview is invalid.",
      },
      { status: 422 },
    );
  }

  const env = getServerEnv();

  if (
    upload.size === 0 ||
    upload.size > env.IMPORT_MAX_FILE_SIZE_BYTES
  ) {
    return Response.json(
      {
        error:
          `File must be between 1 byte and ${env.IMPORT_MAX_FILE_SIZE_BYTES} bytes.`,
      },
      { status: 413 },
    );
  }

  const safeFileName = sanitizeFileName(upload.name);

  if (path.extname(safeFileName).toLowerCase() !== ".xlsx") {
    return Response.json(
      { error: "Only .xlsx files are accepted." },
      { status: 415 },
    );
  }

  if (
    upload.type &&
    upload.type !== XLSX_MIME &&
    upload.type !== "application/octet-stream"
  ) {
    return Response.json(
      { error: "Unexpected workbook MIME type." },
      { status: 415 },
    );
  }

  const bytes = new Uint8Array(await upload.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const duplicate = await db.importBatch.findFirst({
    where: { fileSha256: sha256 },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      batchNumber: true,
      status: true,
      uploadedAt: true,
    },
  });

  // FUTURE: controlled exact-duplicate reprocessing may restore an explicit
  // governed/admin recovery override. Normal governed imports fail closed.
  // Previous override condition:
  // if (
  //   duplicate &&
  //   formData.get("confirmDuplicate") !== "true"
  // ) {
  if (duplicate) {
    return Response.json(
      {
        error: "This exact workbook was imported before. Exact duplicate files cannot be reprocessed through the normal import flow.",
        code: "EXACT_FILE_DUPLICATE",
        duplicate,
      },
      { status: 409 },
    );
  }

  const clientPreviewSha256 = computePreviewSha256(preview);

  // FUTURE: controlled exact-duplicate reprocessing audit marker
  // if (duplicate) {
  //   preview.issues.unshift({
  //     severity: "WARNING",
  //     code: "DUPLICATE_FILE_CONFIRMED",
  //     message:
  //       `Operator explicitly reprocessed duplicate batch ${duplicate.batchNumber}.`,
  //   });
  // }
  const artifactId = randomUUID();
  const batchId = randomUUID();
  const now = new Date();
  const storageKey = storageKeyFor(now, artifactId);
  const batchNumber = makeBatchNumber(now);

  const rowIds = new Map<number, string>(
    preview.rows.map((row) => [row.sourceRowNumber, randomUUID()]),
  );

  const totalRows = preview.rows.length;
  const invalidRows = preview.rows.filter(
    (row) => row.status === "INVALID",
  ).length;
  const validRows = totalRows - invalidRows;
  const warningCount = preview.issues.filter(
    (issue) => issue.severity === "WARNING",
  ).length;

  await storeImmutableArtifact(storageKey, bytes);

  try {
    await db.$transaction(async (transaction) => {
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
          schemaName: preview.schemaName,
          schemaVersion: preview.schemaVersion,
          rawArtifactId: artifactId,
          fileSha256: sha256,
          clientPreviewSha256,
          columnMapping: asJson(preview.columnMapping),
          status: "UPLOADED",
          totalRows,
          validRows,
          invalidRows,
          warningCount,
          uploadedById: session.user.id,
        },
      });

      if (preview.rows.length > 0) {
        await transaction.importRow.createMany({
          data: preview.rows.map((row) => ({
            id: rowIds.get(row.sourceRowNumber)!,
            importBatchId: batchId,
            sourceSheet: row.sourceSheet,
            sourceRowNumber: row.sourceRowNumber,
            sourceRowId: row.sourceRowId,
            rawData: asJson(row.rawData),
            normalizedData: asJson(row.normalizedData),
            status: row.status,
          })),
        });
      }

      if (preview.issues.length > 0) {
        await transaction.importValidationIssue.createMany({
          data: preview.issues.map((issue) => ({
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
          action: "IMPORT_CLIENT_PREVIEW_ACCEPTED",
          entityType: "ImportBatch",
          entityId: batchId,
          metadata: {
            batchNumber,
            schemaVersion: preview.schemaVersion,
            totalRows,
            validRows,
            invalidRows,
            warningCount,
            fileSha256: sha256,
            clientPreviewSha256,
            verificationPending: true,
          },
        },
      });
    });
  } catch (error) {
    await removeUnregisteredArtifact(storageKey).catch(() => undefined);
    console.error("ATI PH import staging failed.", error);

    return Response.json(
      { error: "Import could not be staged." },
      { status: 500 },
    );
  }

  return Response.json(
    {
      batch: {
        id: batchId,
        batchNumber,
        status: "UPLOADED",
        totalRows,
        validRows,
        invalidRows,
        warningCount,
        schemaVersion: preview.schemaVersion,
      },
      issues: preview.issues.slice(0, 50),
      truncatedIssueCount: Math.max(0, preview.issues.length - 50),
      verificationPending: true,
    },
    { status: 202 },
  );
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function sanitizeFileName(value: string): string {
  const baseName = path
    .basename(value)
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "_")
    .trim();

  return (baseName || "holiday-import.xlsx").slice(0, 200);
}

function storageKeyFor(date: Date, artifactId: string): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `raw-imports/${year}/${month}/${artifactId}.xlsx`;
}

function makeBatchNumber(date: Date): string {
  const day = date.toISOString().slice(0, 10).replaceAll("-", "");
  return `PH-${day}-${randomBytes(4).toString("hex").toUpperCase()}`;
}
