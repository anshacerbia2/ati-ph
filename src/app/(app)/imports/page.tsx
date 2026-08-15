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

  const recentImports = await db.importBatch.findMany({
    orderBy: { uploadedAt: "desc" },
    take: 20,
    select: {
      id: true,
      batchNumber: true,
      sourceName: true,
      status: true,
      totalRows: true,
      invalidRows: true,
      warningCount: true,
      uploadedAt: true,
      uploadedBy: {
        select: {
          email: true,
          displayName: true,
        },
      },
    },
  });

  return (
    <div className="page-stack">
      <PageHeader
        description="Stage the governed Holiday_Master workbook and keep raw evidence separate from normalized validation data."
        eyebrow="Operations"
        title="Governed imports"
      />
      <ImportWorkspace
        canUpload={permissions.has(PERMISSIONS.IMPORT_CREATE)}
        recentImports={recentImports.map((batch) => ({
          ...batch,
          uploadedAt: batch.uploadedAt.toISOString(),
        }))}
      />
    </div>
  );
}
