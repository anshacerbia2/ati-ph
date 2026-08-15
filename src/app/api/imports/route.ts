import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { Prisma } from "@prisma/client";

import { getCurrentSession } from "@/auth/session";
import {
  removeUnregisteredArtifact,
  storeImmutableArtifact,
} from "@/artifacts/local-storage";
import {
  parseHolidayWorkbook,
  WorkbookContractError,
} from "@/imports/holiday-workbook";
import { loadActiveRegionAliases } from "@/holiday/region-registry";
import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const UPLOAD_ROLES = new Set(["ADMINISTRATOR", "OPERATOR"]);

export async function POST(request: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!UPLOAD_ROLES.has(session.user.role)) {
    return Response.json(
      { error: "Operator or Administrator permission is required." },
      { status: 403 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Expected a multipart upload." }, { status: 400 });
  }

  const upload = formData.get("file");
  if (!(upload instanceof File)) {
    return Response.json({ error: "XLSX file is required." }, { status: 400 });
  }

  const env = getServerEnv();
  if (upload.size === 0 || upload.size > env.IMPORT_MAX_FILE_SIZE_BYTES) {
    return Response.json(
      { error: `File must be between 1 byte and ${env.IMPORT_MAX_FILE_SIZE_BYTES} bytes.` },
      { status: 413 },
    );
  }

  const safeFileName = sanitizeFileName(upload.name);
  if (path.extname(safeFileName).toLowerCase() !== ".xlsx") {
    return Response.json({ error: "Only .xlsx files are accepted." }, { status: 415 });
  }
  if (upload.type && upload.type !== XLSX_MIME && upload.type !== "application/octet-stream") {
    return Response.json({ error: "Unexpected workbook MIME type." }, { status: 415 });
  }

  const bytes = new Uint8Array(await upload.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const duplicate = await db.importBatch.findFirst({
    where: { fileSha256: sha256 },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, batchNumber: true, status: true, uploadedAt: true },
  });
  if (duplicate && formData.get("confirmDuplicate") !== "true") {
    return Response.json(
      {
        error: "This exact workbook was imported before.",
        code: "DUPLICATE_FILE_CONFIRMATION_REQUIRED",
        duplicate,
      },
      { status: 409 },
    );
  }

  let parsed;
  try {
    const regionAliases = await loadActiveRegionAliases();
    if (regionAliases.size === 0) {
      console.error("ATI PH calendar-region registry has no active aliases.");
      return Response.json(
        { error: "Calendar-region registry is not configured." },
        { status: 503 },
      );
    }

    parsed = await parseHolidayWorkbook(bytes, {
      regionAliases,
      rejectSampleRows: process.env.NODE_ENV === "production",
    });
  } catch (error) {
    if (error instanceof WorkbookContractError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    console.error("ATI PH workbook parsing failed.", error);
    return Response.json({ error: "Workbook parsing failed." }, { status: 422 });
  }

  if (duplicate) {
    parsed.issues.unshift({
      severity: "WARNING",
      code: "DUPLICATE_FILE_CONFIRMED",
      message: `Operator explicitly reprocessed duplicate batch ${duplicate.batchNumber}.`,
    });
  }

  const artifactId = randomUUID();
  const batchId = randomUUID();
  const now = new Date();
  const storageKey = storageKeyFor(now, artifactId);
  const batchNumber = makeBatchNumber(now);
  const rowIds = new Map<number, string>(
    parsed.rows.map((row) => [row.sourceRowNumber, randomUUID()]),
  );
  const totalRows = parsed.rows.length;
  const invalidRows = parsed.rows.filter((row) => row.status === "INVALID").length;
  const validRows = totalRows - invalidRows;
  const warningCount = parsed.issues.filter((issue) => issue.severity === "WARNING").length;
  const hasErrors = parsed.issues.some((issue) => issue.severity === "ERROR");
  const status = hasErrors || totalRows === 0 ? "INVALID" : "VALIDATED";

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
          schemaName: parsed.schemaName,
          schemaVersion: parsed.schemaVersion,
          rawArtifactId: artifactId,
          fileSha256: sha256,
          columnMapping: asJson(parsed.columnMapping),
          status,
          totalRows,
          validRows,
          invalidRows,
          warningCount,
          uploadedById: session.user.id,
        },
      });

      if (parsed.rows.length > 0) {
        await transaction.importRow.createMany({
          data: parsed.rows.map((row) => ({
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

      if (parsed.issues.length > 0) {
        await transaction.importValidationIssue.createMany({
          data: parsed.issues.map((issue) => ({
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
          action: "IMPORT_BATCH_UPLOADED",
          entityType: "ImportBatch",
          entityId: batchId,
          metadata: {
            batchNumber,
            status,
            schemaVersion: parsed.schemaVersion,
            totalRows,
            validRows,
            invalidRows,
            warningCount,
            sha256,
          },
        },
      });

      if (status === "VALIDATED") {
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
    await removeUnregisteredArtifact(storageKey).catch(() => undefined);
    console.error("ATI PH import persistence failed.", error);
    return Response.json({ error: "Import could not be persisted." }, { status: 500 });
  }

  return Response.json(
    {
      batch: {
        id: batchId,
        batchNumber,
        status,
        totalRows,
        validRows,
        invalidRows,
        warningCount,
        schemaVersion: parsed.schemaVersion,
      },
      issues: parsed.issues.slice(0, 50),
      truncatedIssueCount: Math.max(0, parsed.issues.length - 50),
    },
    { status: 201 },
  );
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function sanitizeFileName(value: string): string {
  const baseName = path.basename(value).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "_").trim();
  return (baseName || "holiday-import.xlsx").slice(0, 255);
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
