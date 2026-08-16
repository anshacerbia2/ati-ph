import { redirect } from "next/navigation";

import { PERMISSIONS } from "@/auth/authorization-catalog";
import { getUserAuthorization } from "@/auth/authorization";
import { getCurrentSession } from "@/auth/session";
import { AccessDenied } from "@/components/app-shell/AccessDenied";
import { PageHeader } from "@/components/app-shell/PageHeader";
import { ImportWorkspace } from "@/components/ph-dashboard/ImportWorkspace";
import { db } from "@/lib/db";

export default async function ImportsPage() {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/api/auth/login");
  }

  const authorization = await getUserAuthorization(session.user.id);
  const permissions = new Set(authorization.permissions);

  if (!permissions.has(PERMISSIONS.IMPORT_READ)) {
    return <AccessDenied />;
  }

  const [recentImports, previewAliases] = await Promise.all([
    db.importBatch.findMany({
      orderBy: { uploadedAt: "desc" },
      take: 20,
      select: {
        id: true,
        batchNumber: true,
        sourceName: true,
        status: true,
        totalRows: true,
        validRows: true,
        invalidRows: true,
        warningCount: true,
        uploadedAt: true,
        publishedAt: true,
        uploadedBy: {
          select: {
            displayName: true,
            email: true,
          },
        },
      },
    }),
    db.calendarRegionAlias.findMany({
      where: {
        isActive: true,
        region: { isActive: true },
      },
      orderBy: { normalizedAlias: "asc" },
      select: {
        normalizedAlias: true,
        region: {
          select: { code: true },
        },
      },
    }),
  ]);

  const latestApprovalStatusByBatchId = new Map<
    string,
    "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"
  >();

  if (recentImports.length > 0) {
    const approvals = await db.approvalRequest.findMany({
      where: {
        resourceType: "ImportBatch",
        resourceId: {
          in: recentImports.map((batch) => batch.id),
        },
      },
      orderBy: { requestedAt: "desc" },
      select: {
        resourceId: true,
        status: true,
      },
    });

    for (const approval of approvals) {
      if (!latestApprovalStatusByBatchId.has(approval.resourceId)) {
        latestApprovalStatusByBatchId.set(
          approval.resourceId,
          approval.status,
        );
      }
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        description="Preview Holiday_Master locally, then submit the raw workbook and confirmed normalized payload for authoritative server verification."
        eyebrow="Operations"
        title="Governed imports"
      />

      <ImportWorkspace
        canUpload={permissions.has(PERMISSIONS.IMPORT_CREATE)}
        previewRegionAliases={previewAliases.map((entry) => ({
          normalizedAlias: entry.normalizedAlias,
          regionCode: entry.region.code,
        }))}
        recentImports={recentImports.map((batch) => ({
          ...batch,
          uploadedAt: batch.uploadedAt.toISOString(),
          approvalStatus:
            latestApprovalStatusByBatchId.get(batch.id) ??
            "NOT_SUBMITTED",
          publishedAt: batch.publishedAt?.toISOString() ?? null,
          uploadedBy:
            batch.uploadedBy.displayName ?? batch.uploadedBy.email,
        }))}
      />
    </div>
  );
}
