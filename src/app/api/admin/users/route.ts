import { z } from "zod";

import { PERMISSIONS } from "@/auth/authorization-catalog";
import { authorizeRoute } from "@/auth/route-access";
import {
  listAssignableRoles,
  listDirectoryUsers,
  setUserActive,
  setUserRole,
} from "@/auth/user-directory";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.USER_READ);
  if (!access.ok) return access.response;

  const [users, roles] = await Promise.all([
    listDirectoryUsers(),
    listAssignableRoles(),
  ]);

  return Response.json({ users, roles });
}

/*
 * One body shape for both changes, discriminated on `change`.
 *
 * Granting a role and ending someone's access are different decisions, but they are made
 * on the same screen about the same person and both require `USER_MANAGE`. Two endpoints
 * would mean two places to forget the permission check.
 */
const changeSchema = z.discriminatedUnion("change", [
  z.object({
    change: z.literal("role"),
    userId: z.uuid(),
    roleCode: z.string().trim().min(1).max(80),
    granted: z.boolean(),
  }),
  z.object({
    change: z.literal("active"),
    userId: z.uuid(),
    isActive: z.boolean(),
  }),
]);

export async function POST(request: Request): Promise<Response> {
  const access = await authorizeRoute(PERMISSIONS.USER_MANAGE);
  if (!access.ok) return access.response;

  const parsed = changeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request body.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const outcome =
    body.change === "role"
      ? await setUserRole({
          actorUserId: access.session.user.id,
          userId: body.userId,
          roleCode: body.roleCode,
          granted: body.granted,
        })
      : await setUserActive({
          actorUserId: access.session.user.id,
          userId: body.userId,
          isActive: body.isActive,
        });

  if (!outcome.ok) {
    /*
     * `409`, not `400`. The request was well formed and the caller was entitled to make
     * it; the estate is in a state that refuses it. A `400` would send an administrator
     * looking for a mistake in what they clicked.
     */
    const status = outcome.code === "LAST_ADMINISTRATOR" ? 409 : 404;
    return Response.json({ error: MESSAGES[outcome.code] }, { status });
  }

  return Response.json({ changed: outcome.changed });
}

const MESSAGES = {
  USER_NOT_FOUND: "That user no longer exists, or the change is not permitted.",
  ROLE_NOT_FOUND: "That role no longer exists or has been deactivated.",
  LAST_ADMINISTRATOR:
    "This is the last administrator. Grant the role to somebody else before removing it here — otherwise nobody can administer ATI PH, including the screen that would undo it.",
} as const;
