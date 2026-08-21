import { redirect } from "next/navigation";

import { PERMISSIONS } from "@/auth/authorization-catalog";
import { getUserAuthorization } from "@/auth/authorization";
import { getCurrentSession } from "@/auth/session";
import { AccessDenied } from "@/components/app-shell/AccessDenied";
import { PageHeader } from "@/components/app-shell/PageHeader";
import { DeliveryAudit } from "@/components/ph-dashboard/DeliveryAudit";

export default async function DeliveriesPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/api/auth/login");

  const authorization = await getUserAuthorization(session.user.id);

  if (
    !new Set(authorization.permissions).has(
      PERMISSIONS.NOTIFICATION_PLAN_READ,
    )
  ) {
    return <AccessDenied />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        description="Every committed notification job, across every holiday. One job is one subscription and one email; each carries the recipients it was frozen with, the provider's answer, and the exact message that was sent."
        eyebrow="Operations"
        title="Deliveries"
      />
      <DeliveryAudit />
    </div>
  );
}
