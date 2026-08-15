import { createHash } from "node:crypto";

import { readStoredArtifact } from "@/artifacts/local-storage";
import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.IMPORT_READ);
  if (!access.ok) {
    return access.response;
  }

  const { batchId } = await params;
  const batch = await db.importBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      batchNumber: true,
      sourceName: true,
      rawArtifact: {
        select: {
          id: true,
          artifactType: true,
          fileName: true,
          mimeType: true,
          sha256: true,
          storageProvider: true,
          storageKey: true,
        },
      },
    },
  });

  if (!batch) {
    return Response.json(
      { error: "Import batch was not found." },
      { status: 404 },
    );
  }

  const artifact = batch.rawArtifact;
  if (
    artifact.artifactType !== "RAW_IMPORT" ||
    artifact.storageProvider !== "LOCAL"
  ) {
    console.error(
      "ATI PH raw artifact has an unsupported storage contract.",
      {
        batchId,
        artifactId: artifact.id,
        artifactType: artifact.artifactType,
        storageProvider: artifact.storageProvider,
      },
    );
    return Response.json(
      { error: "Raw import evidence is unavailable." },
      { status: 500 },
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = await readStoredArtifact(artifact.storageKey);
  } catch (error) {
    console.error("ATI PH raw artifact could not be read.", error);
    return Response.json(
      { error: "Raw import evidence is unavailable." },
      { status: 500 },
    );
  }

  const actualSha256 = createHash("sha256")
    .update(bytes)
    .digest("hex");

  if (actualSha256 !== artifact.sha256) {
    console.error("ATI PH raw artifact integrity check failed.", {
      batchId,
      artifactId: artifact.id,
      expectedSha256: artifact.sha256,
      actualSha256,
    });
    return Response.json(
      { error: "Raw import evidence failed integrity verification." },
      { status: 500 },
    );
  }

  try {
    await db.auditEvent.create({
      data: {
        userId: access.session.user.id,
        action: "IMPORT_RAW_ARTIFACT_DOWNLOADED",
        entityType: "ImportBatch",
        entityId: batch.id,
        metadata: {
          batchNumber: batch.batchNumber,
          artifactId: artifact.id,
          sha256: artifact.sha256,
        },
      },
    });
  } catch (error) {
    console.error("ATI PH raw download could not be audited.", error);
    return Response.json(
      { error: "Raw import evidence could not be released." },
      { status: 500 },
    );
  }

  const responseBody = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(responseBody).set(bytes);

  return new Response(responseBody, {
    status: 200,
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": attachmentDisposition(
        artifact.fileName || batch.sourceName,
      ),
      "content-type":
        artifact.mimeType || "application/octet-stream",
      "x-content-type-options": "nosniff",
    },
  });
}

function attachmentDisposition(fileName: string): string {
  const safeAscii = fileName
    .replace(/[\r\n"]/g, "_")
    .replace(/[^\x20-\x7E]/g, "_")
    .slice(0, 180);

  return `attachment; filename="${safeAscii || "raw-import.xlsx"}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
