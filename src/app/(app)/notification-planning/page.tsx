import { redirect } from "next/navigation";

import { PERMISSIONS } from "@/auth/authorization-catalog";
import { getUserAuthorization } from "@/auth/authorization";
import { getCurrentSession } from "@/auth/session";
import { AccessDenied } from "@/components/app-shell/AccessDenied";
import { PageHeader } from "@/components/app-shell/PageHeader";
import { NotificationPlanning } from "@/components/ph-dashboard/NotificationPlanning";

export default async function NotificationPlanningPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/api/auth/login");

  const authorization =
    await getUserAuthorization(session.user.id);
  const permissions = new Set(
    authorization.permissions,
  );

  if (
    !permissions.has(
      PERMISSIONS.NOTIFICATION_PLAN_READ,
    )
  ) {
    return <AccessDenied />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        description="Preview and commit durable notification jobs, then govern approval before scheduling. Delivery execution contracts are prepared, but no provider or email sender is wired yet."
        eyebrow="Operations"
        title="Notification planning"
      />
      <NotificationPlanning
        canApprove={permissions.has(
          PERMISSIONS.NOTIFICATION_PLAN_APPROVE,
        )}
        canCommit={permissions.has(
          PERMISSIONS.NOTIFICATION_PLAN_COMMIT,
        )}
      />
    </div>
  );
}
