import { redirect } from "next/navigation";

import { PERMISSIONS } from "@/auth/authorization-catalog";
import { getUserAuthorization } from "@/auth/authorization";
import { getCurrentSession } from "@/auth/session";
import { AccessDenied } from "@/components/app-shell/AccessDenied";
import { PageHeader } from "@/components/app-shell/PageHeader";
import { DeliveryOperations } from "@/components/ph-dashboard/DeliveryOperations";
import { NotificationAuditTimeline } from "@/components/ph-dashboard/NotificationAuditTimeline";
import { NotificationPlanning } from "@/components/ph-dashboard/NotificationPlanning";
import { TrustedAutomationOperations } from "@/components/ph-dashboard/TrustedAutomationOperations";

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
        description="Preview and commit durable notification jobs, govern approval, and reconcile ambiguous delivery outcomes. Automatic SMTP execution is implemented but remains double-gated by explicit release controls."
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
      <TrustedAutomationOperations />
      <DeliveryOperations
        canReconcile={permissions.has(
          PERMISSIONS.NOTIFICATION_PLAN_APPROVE,
        )}
      />
      <NotificationAuditTimeline />
    </div>
  );
}
