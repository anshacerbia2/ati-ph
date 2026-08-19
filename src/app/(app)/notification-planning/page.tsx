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

  const authorization = await getUserAuthorization(session.user.id);
  const permissions = new Set(authorization.permissions);
  if (!permissions.has(PERMISSIONS.NOTIFICATION_PLAN_READ)) {
    return <AccessDenied />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        description="Preview holiday-to-client routing and schedule calculation, then explicitly commit a ready plan into durable jobs. The scheduler marks due jobs only; email delivery is not implemented yet."
        eyebrow="Operations"
        title="Notification planning"
      />
      <NotificationPlanning
        canCommit={permissions.has(
          PERMISSIONS.NOTIFICATION_PLAN_COMMIT,
        )}
      />
    </div>
  );
}
