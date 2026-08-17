import { redirect } from "next/navigation";

import { PERMISSIONS } from "@/auth/authorization-catalog";
import { getUserAuthorization } from "@/auth/authorization";
import { getCurrentSession } from "@/auth/session";
import { AccessDenied } from "@/components/app-shell/AccessDenied";
import { PageHeader } from "@/components/app-shell/PageHeader";
import { ClientRoutingAdmin } from "@/components/ph-dashboard/ClientRoutingAdmin";

export default async function ClientRoutingPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  const authorization = await getUserAuthorization(session.user.id);
  const permissions = new Set(authorization.permissions);

  if (!permissions.has(PERMISSIONS.CLIENT_READ)) {
    return <AccessDenied />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        description="Governed client, service-team, recipient, and calendar-region routing configuration."
        eyebrow="Administration"
        title="Client routing"
      />
      <ClientRoutingAdmin
        canManage={permissions.has(PERMISSIONS.CLIENT_MANAGE)}
      />
    </div>
  );
}
