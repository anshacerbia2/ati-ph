import "server-only";

import {
  type PermissionCode,
} from "@/auth/authorization-catalog";
import { userHasPermission } from "@/auth/authorization";
import { getCurrentSession } from "@/auth/session";

export async function authorizeRoute(
  requiredPermission: PermissionCode,
) {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Authentication required." },
        { status: 401 },
      ),
    };
  }

  if (!(await userHasPermission(session.user.id, requiredPermission))) {
    return {
      ok: false as const,
      response: Response.json(
        {
          error: "Required application permission is missing.",
          permission: requiredPermission,
        },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true as const,
    session,
  };
}
