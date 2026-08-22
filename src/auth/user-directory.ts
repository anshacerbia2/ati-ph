import "server-only";

import {
  SYSTEM_ROLES,
  type RoleCode,
} from "@/auth/authorization-catalog";
import { db } from "@/lib/db";

export type DirectoryUser = {
  id: string;
  email: string;
  displayName: string | null;
  isActive: boolean;
  createdAt: string;
  roleCodes: string[];
  /** Sessions not revoked and not expired. Zero means signed out everywhere. */
  activeSessions: number;
};

export type AssignableRole = {
  code: string;
  name: string;
  description: string | null;
};

/**
 * Everyone who has ever signed in, with what they hold.
 *
 * ## There is no "invite"
 *
 * A row appears the first time somebody completes sign-in, not when an administrator adds
 * them — the realm decides who may authenticate, this database decides what they may do,
 * and those are different questions with different owners (`docs/ACCESS-CONTROL.md`).
 * So a person who has never opened ATI PH cannot be granted a role in advance, and the
 * screen says so rather than offering a field that would quietly create a second
 * identity store.
 *
 * ## Active sessions are shown because revocation is not immediate
 *
 * Taking a role away does not end a session; it changes what the next request is allowed
 * to do, and a page already open keeps its rendered content. An administrator revoking
 * access during an incident needs to see whether anyone is still holding a live session,
 * which is a different question from what the role table says.
 */
export async function listDirectoryUsers(): Promise<DirectoryUser[]> {
  const now = new Date();

  const users = await db.user.findMany({
    orderBy: [{ isActive: "desc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      displayName: true,
      isActive: true,
      createdAt: true,
      roleAssignments: {
        where: { role: { isActive: true } },
        select: { role: { select: { code: true } } },
      },
      _count: {
        select: {
          sessions: { where: { revokedAt: null, expiresAt: { gt: now } } },
        },
      },
    },
  });

  return users.map((user) => ({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    roleCodes: user.roleAssignments
      .map((assignment) => assignment.role.code)
      .sort(),
    activeSessions: user._count.sessions,
  }));
}

/**
 * The roles an administrator may hand out.
 *
 * Read from the database rather than from `SYSTEM_ROLES` so a role deactivated by an
 * operator disappears from the screen instead of being offered and then refused. Ordered
 * by the catalogue, because alphabetical would put Administrator first and Auditor
 * second, which reads as a hierarchy that does not exist.
 */
export async function listAssignableRoles(): Promise<AssignableRole[]> {
  const roles = await db.role.findMany({
    where: { isActive: true },
    select: { code: true, name: true, description: true },
  });

  const order = new Map<string, number>(
    SYSTEM_ROLES.map((role, index) => [role.code as string, index]),
  );

  return roles.sort(
    (a, b) =>
      (order.get(a.code) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.code) ?? Number.MAX_SAFE_INTEGER),
  );
}

export type RoleChangeOutcome =
  | { ok: true; changed: boolean }
  | { ok: false; code: "USER_NOT_FOUND" | "ROLE_NOT_FOUND" | "LAST_ADMINISTRATOR" };

/**
 * Grants or revokes one role for one user, and records who did it.
 *
 * ## The last administrator cannot be removed
 *
 * Revoking the final `ADMINISTRATOR` leaves an estate nobody can administer — the screen
 * that grants roles requires the role it just removed. Recovery would mean editing the
 * database by hand, or setting `BOOTSTRAP_ADMINISTRATOR_EMAIL` and restarting, on a
 * production host, during whatever incident caused it. Refusing costs one confusing
 * moment; allowing it costs an outage of the control plane itself.
 *
 * This counts assignments rather than people who can sign in. A user who is deactivated
 * still counts, which is deliberately conservative: reactivating them is one click, and
 * the alternative is a rule that has to reason about two states at once.
 */
export async function setUserRole(input: {
  actorUserId: string;
  userId: string;
  roleCode: string;
  granted: boolean;
}): Promise<RoleChangeOutcome> {
  const [user, role] = await Promise.all([
    db.user.findUnique({
      where: { id: input.userId },
      select: { id: true, email: true },
    }),
    db.role.findUnique({
      where: { code: input.roleCode },
      select: { id: true, code: true, isActive: true },
    }),
  ]);

  if (!user) return { ok: false, code: "USER_NOT_FOUND" };
  if (!role || !role.isActive) return { ok: false, code: "ROLE_NOT_FOUND" };

  if (!input.granted && role.code === ("ADMINISTRATOR" satisfies RoleCode)) {
    const administrators = await db.userRoleAssignment.count({
      where: { roleId: role.id },
    });
    const holdsIt = await db.userRoleAssignment.findUnique({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      select: { userId: true },
    });

    if (holdsIt && administrators <= 1) {
      return { ok: false, code: "LAST_ADMINISTRATOR" };
    }
  }

  const changed = input.granted
    ? (
        await db.userRoleAssignment.createMany({
          data: [{ userId: user.id, roleId: role.id }],
          skipDuplicates: true,
        })
      ).count > 0
    : (
        await db.userRoleAssignment.deleteMany({
          where: { userId: user.id, roleId: role.id },
        })
      ).count > 0;

  // No audit row for a no-op. A trail that records "granted" for a role somebody already
  // held reads as a change that never happened.
  if (changed) {
    await db.auditEvent.create({
      data: {
        userId: input.actorUserId,
        action: input.granted ? "USER_ROLE_GRANTED" : "USER_ROLE_REVOKED",
        entityType: "UserRoleAssignment",
        entityId: user.id,
        metadata: { roleCode: role.code, subjectEmail: user.email },
      },
    });
  }

  return { ok: true, changed };
}

/**
 * Deactivates or reactivates a user.
 *
 * Deactivation is the control that ends access now: `resolveFreshSession` revokes the
 * session of an inactive user on their next request, so it does not wait for a role
 * change to be noticed. Revoking a role and deactivating an account answer different
 * questions — "should they still be able to approve" against "should they still be able
 * to get in" — and an incident needs the second.
 *
 * Never applies to the actor. Deactivating yourself ends your own session on the next
 * request, on a screen that requires a live session to undo it.
 */
export async function setUserActive(input: {
  actorUserId: string;
  userId: string;
  isActive: boolean;
}): Promise<RoleChangeOutcome> {
  if (input.actorUserId === input.userId) {
    return { ok: false, code: "USER_NOT_FOUND" };
  }

  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, isActive: true },
  });
  if (!user) return { ok: false, code: "USER_NOT_FOUND" };
  if (user.isActive === input.isActive) return { ok: true, changed: false };

  await db.user.update({
    where: { id: user.id },
    data: { isActive: input.isActive },
  });

  await db.auditEvent.create({
    data: {
      userId: input.actorUserId,
      action: input.isActive ? "USER_REACTIVATED" : "USER_DEACTIVATED",
      entityType: "User",
      entityId: user.id,
      metadata: { subjectEmail: user.email },
    },
  });

  return { ok: true, changed: true };
}
