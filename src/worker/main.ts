import { computeBusinessContentSha256 } from "@/imports/business-content";
import { randomUUID } from "node:crypto";

import { Prisma, PrismaClient } from "@prisma/client";

import { readStoredArtifact } from "@/artifacts/local-storage-node";
import { getServerEnv } from "@/config/server-env";
import {
  parseHolidayWorkbook,
  WorkbookContractError,
} from "@/imports/holiday-workbook";
import { computePreviewSha256 } from "@/imports/preview-integrity";
import { assertSafeXlsxPackage } from "@/imports/xlsx-safety";

const db = new PrismaClient();
const STALE_VERIFICATION_MS = 5 * 60 * 1_000;

let stopping = false;

async function maintenanceCycle(): Promise<void> {
  await verifyPendingImports();

  const result = await db.authSession.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });

  if (result.count > 0) {
    console.info(`Removed ${result.count} expired ati-ph session(s).`);
  }
}

async function verifyPendingImports(): Promise<void> {
  for (let index = 0; index < 3 && !stopping; index += 1) {
    const worked = await verifyOnePendingImport();
    if (!worked) return;
  }
}

async function verifyOnePendingImport(): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_VERIFICATION_MS);

  const candidate = await db.importBatch.findFirst({
    where: {
      clientPreviewSha256: { not: null },
      OR: [
        { status: "UPLOADED" },
        {
          status: "VERIFYING",
          verificationStartedAt: { lte: staleBefore },
        },
      ],
    },
    orderBy: { uploadedAt: "asc" },
    select: { id: true },
  });

  if (!candidate) return false;

  const claim = await db.importBatch.updateMany({
    where: {
      id: candidate.id,
      OR: [
        { status: "UPLOADED" },
        {
          status: "VERIFYING",
          verificationStartedAt: { lte: staleBefore },
        },
      ],
    },
    data: {
      status: "VERIFYING",
      verificationStartedAt: new Date(),
      verifiedAt: null,
      failureReason: null,
    },
  });

  if (claim.count === 0) return true;

  const batch = await db.importBatch.findUnique({
    where: { id: candidate.id },
    select: {
      id: true,
      batchNumber: true,
      clientPreviewSha256: true,
      rawArtifact: {
        select: {
          storageProvider: true,
          storageKey: true,
        },
      },
      rows: {
        select: {
          id: true,
          sourceRowNumber: true,
        },
      },
      issues: {
        where: {
          errorCode: "DUPLICATE_FILE_CONFIRMED",
        },
        select: {
          severity: true,
          errorCode: true,
          fieldName: true,
          rejectedValue: true,
          message: true,
        },
      },
    },
  });

  if (!batch || !batch.clientPreviewSha256) return true;

  try {
    if (batch.rawArtifact.storageProvider !== "LOCAL") {
      throw new Error("Unsupported raw artifact provider.");
    }

    const bytes = await readStoredArtifact(batch.rawArtifact.storageKey);
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

    const regionAliases = new Map(
      activeAliases.map((entry) => [
        entry.normalizedAlias,
        entry.region.code,
      ]),
    );

    if (regionAliases.size === 0) {
      throw new Error(
        "Calendar-region registry has no active aliases.",
      );
    }

    const parsed = await parseHolidayWorkbook(bytes, {
      regionAliases,
      rejectSampleRows: true,
    });

  const businessContentSha256 =
      computeBusinessContentSha256(parsed.rows);
  
    await db.importBatch.update({
      where: { id: batch.id },
      data: { businessContentSha256 },
    });

    const verifiedHash = computePreviewSha256(parsed);
    if (verifiedHash !== batch.clientPreviewSha256) {
      throw new Error(
        "Client preview does not match authoritative server parsing of the stored workbook.",
      );
    }

    const rowIdByNumber = new Map(
      batch.rows.map((row) => [row.sourceRowNumber, row.id]),
    );

    if (
      parsed.rows.length !== rowIdByNumber.size ||
      parsed.rows.some((row) => !rowIdByNumber.has(row.sourceRowNumber))
    ) {
      throw new Error(
        "Verified workbook source rows do not match staged preview lineage.",
      );
    }

    const totalRows = parsed.rows.length;
    const invalidRows = parsed.rows.filter(
      (row) => row.status === "INVALID",
    ).length;
    const validRows = totalRows - invalidRows;
    const verifiedIssues = [
      ...parsed.issues,
      ...batch.issues.map((issue) => ({
        severity: issue.severity,
        code: issue.errorCode,
        fieldName: issue.fieldName ?? undefined,
        rejectedValue: issue.rejectedValue ?? undefined,
        message: issue.message,
        sourceRowNumber: undefined,
      })),
    ];

    const warningCount = verifiedIssues.filter(
      (issue) => issue.severity === "WARNING",
    ).length;
    const hasErrors = parsed.issues.some(
      (issue) => issue.severity === "ERROR",
    );
    const finalStatus =
      hasErrors || totalRows === 0 ? "INVALID" : "VALIDATED";
    const verifiedAt = new Date();

    await db.$transaction(async (transaction) => {
      for (const row of parsed.rows) {
        await transaction.importRow.update({
          where: { id: rowIdByNumber.get(row.sourceRowNumber)! },
          data: {
            sourceRowId: row.sourceRowId,
            rawData: asJson(row.rawData),
            normalizedData: asJson(row.normalizedData),
            status: row.status,
          },
        });
      }

      await transaction.importValidationIssue.deleteMany({
        where: { importBatchId: batch.id },
      });

      if (verifiedIssues.length > 0) {
        await transaction.importValidationIssue.createMany({
          data: verifiedIssues.map((issue) => ({
            id: randomUUID(),
            importBatchId: batch.id,
            importRowId: issue.sourceRowNumber
              ? rowIdByNumber.get(issue.sourceRowNumber)
              : undefined,
            severity: issue.severity,
            errorCode: issue.code,
            fieldName: issue.fieldName,
            rejectedValue: issue.rejectedValue,
            message: issue.message,
          })),
        });
      }

      await transaction.importBatch.update({
        where: { id: batch.id },
        data: {
          status: finalStatus,
          totalRows,
          validRows,
          invalidRows,
          warningCount,
          verifiedAt,
          failureReason: null,
        },
      });

      await transaction.auditEvent.create({
        data: {
          action: "IMPORT_WORKBOOK_VERIFIED",
          entityType: "ImportBatch",
          entityId: batch.id,
          metadata: {
            batchNumber: batch.batchNumber,
            clientPreviewSha256: batch.clientPreviewSha256,
            verifiedPreviewSha256: verifiedHash,
            status: finalStatus,
            totalRows,
            validRows,
            invalidRows,
            warningCount,
          },
        },
      });

      if (finalStatus === "VALIDATED") {
        await transaction.outboxEvent.create({
          data: {
            topic: "ImportBatchValidated",
            aggregateType: "ImportBatch",
            aggregateId: batch.id,
            payload: {
              eventVersion: 1,
              importBatchId: batch.id,
              occurredAt: verifiedAt.toISOString(),
            },
          },
        });
      }
    });

    console.info(
      `Verified import ${batch.batchNumber}: ${finalStatus}.`,
    );
  } catch (error) {
    const reason =
      error instanceof WorkbookContractError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unknown verification failure.";

    await db.$transaction(async (transaction) => {
      await transaction.importBatch.update({
        where: { id: batch.id },
        data: {
          status: "FAILED",
          verifiedAt: new Date(),
          failureReason: reason.slice(0, 2_000),
        },
      });

      await transaction.auditEvent.create({
        data: {
          action: "IMPORT_WORKBOOK_VERIFICATION_FAILED",
          entityType: "ImportBatch",
          entityId: batch.id,
          metadata: {
            batchNumber: batch.batchNumber,
            reason: reason.slice(0, 2_000),
          },
        },
      });
    });

    console.error(
      `Import verification failed for ${batch.batchNumber}.`,
      error,
    );
  }

  return true;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main(): Promise<void> {
  const { WORKER_POLL_INTERVAL_MS } = getServerEnv();
  console.info("ati-ph worker started");

  while (!stopping) {
    try {
      await maintenanceCycle();
    } catch (error) {
      console.error("ati-ph worker cycle failed", error);
    }

    if (!stopping) {
      await wait(WORKER_POLL_INTERVAL_MS);
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

main()
  .catch((error) => {
    console.error("ati-ph worker failed to start", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    console.info("ati-ph worker stopped");
  });
