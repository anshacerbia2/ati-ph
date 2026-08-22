import { redirect } from "next/navigation";

import { PERMISSIONS } from "@/auth/authorization-catalog";
import { getUserAuthorization } from "@/auth/authorization";
import { getCurrentSession } from "@/auth/session";
import { AccessDenied } from "@/components/app-shell/AccessDenied";
import { PageHeader } from "@/components/app-shell/PageHeader";
import { UserAdmin } from "@/components/ph-dashboard/UserAdmin";

export default async function UsersPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/api/auth/login");

  const authorization = await getUserAuthorization(session.user.id);
  const permissions = new Set(authorization.permissions);
  if (!permissions.has(PERMISSIONS.USER_READ)) {
    return <AccessDenied />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        description="Everyone who has signed in, and what each of them may do. Authentication is ATI One's realm; authorisation is this database, and the two are deliberately separate."
        eyebrow="Administration"
        title="Users"
      />
      <UserAdmin
        canManage={permissions.has(PERMISSIONS.USER_MANAGE)}
        currentUserId={session.user.id}
      />
    </div>
  );
}
