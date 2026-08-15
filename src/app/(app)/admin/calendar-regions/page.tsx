import { redirect } from "next/navigation";

import { PERMISSIONS } from "@/auth/authorization-catalog";
import { getUserAuthorization } from "@/auth/authorization";
import { getCurrentSession } from "@/auth/session";
import { AccessDenied } from "@/components/app-shell/AccessDenied";
import { PageHeader } from "@/components/app-shell/PageHeader";
import { CalendarRegionAdmin } from "@/components/ph-dashboard/CalendarRegionAdmin";

export default async function CalendarRegionsPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  const authorization = await getUserAuthorization(session.user.id);
  const permissions = new Set(authorization.permissions);

  if (!permissions.has(PERMISSIONS.CALENDAR_REGION_READ)) {
    return <AccessDenied />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        description="Canonical region codes and approved source aliases used by governed workbook imports."
        eyebrow="Administration"
        title="Calendar regions"
      />
      <CalendarRegionAdmin
        canManage={permissions.has(PERMISSIONS.CALENDAR_REGION_MANAGE)}
      />
    </div>
  );
}
