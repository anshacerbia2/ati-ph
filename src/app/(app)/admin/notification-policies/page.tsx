import { redirect } from "next/navigation";

import { PERMISSIONS } from "@/auth/authorization-catalog";
import { getUserAuthorization } from "@/auth/authorization";
import { getCurrentSession } from "@/auth/session";
import { AccessDenied } from "@/components/app-shell/AccessDenied";
import { PageHeader } from "@/components/app-shell/PageHeader";
import { NotificationPolicyAdmin } from "@/components/ph-dashboard/NotificationPolicyAdmin";

export default async function NotificationPoliciesPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/api/auth/login");

  const authorization = await getUserAuthorization(session.user.id);
  const permissions = new Set(authorization.permissions);
  if (!permissions.has(PERMISSIONS.NOTIFICATION_POLICY_READ)) {
    return <AccessDenied />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        description="Versioned notification behavior for each client holiday subscription. Unconfirmed scheduling fields remain visibly incomplete rather than inferred."
        eyebrow="Administration"
        title="Notification policies"
      />
      <NotificationPolicyAdmin
        canManage={permissions.has(PERMISSIONS.NOTIFICATION_POLICY_MANAGE)}
      />
    </div>
  );
}
