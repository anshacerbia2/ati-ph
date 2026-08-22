import "server-only";

import { bootstrapRoleFor } from "@/auth/bootstrap-administrator";
import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";

/**
 * Applies the bootstrap grant, once, at sign-in.
 *
 * Separated from the callback route so the decision (`bootstrapRoleFor`, pure and fully
 * tested) stays apart from the write. This function is the write, and everything it does
 * beyond calling that decision is about making the grant impossible to miss afterwards.
 *
 * ## Recorded, always
 *
 * A role nobody granted is exactly the kind of change an audit asks about a year later,
 * and "the environment file did it" is only an answer if there is a row saying so. The
 * audit event carries the address that matched, so the trail names the configuration
 * rather than implying a person made a decision.
 *
 * ## Never throws
 *
 * A failure here must not fail the sign-in. The user is already authenticated and their
 * session already exists; refusing to complete the callback would strand them on an error
 * page over a grant they did not ask for. It is logged and the sign-in proceeds without
 * the role, which is the safe direction — no access is created by an error.
 */
export async function applyBootstrapGrant(
  userId: string,
  email: string,
): Promise<void> {
  try {
    const configuredEmail = getServerEnv().BOOTSTRAP_ADMINISTRATOR_EMAIL;
    if (!configuredEmail) {
      return;
    }

    // Counted rather than fetched: the rule needs "any role at all", and asking for the
    // roles themselves would invite a later change to start reasoning about which ones.
    const existingRoleCount = await db.userRoleAssignment.count({
      where: { userId },
    });

    const roleCode = bootstrapRoleFor({
      email,
      existingRoleCount,
      configuredEmail,
    });
    if (!roleCode) {
      return;
    }

    const role = await db.role.findUnique({
      where: { code: roleCode },
      select: { id: true },
    });
    if (!role) {
      // The seed creates it. A database without it is one the seed has never run against,
      // and inventing the role here would hide that.
      console.error(
        `Bootstrap administrator grant skipped: role ${roleCode} does not exist. Run the seed.`,
      );
      return;
    }

    /*
     * `createMany` with `skipDuplicates`, not `create`. Two tabs completing a sign-in at
     * the same moment both read zero roles and both grant; the second would otherwise
     * throw on the composite primary key and log an error about a state that is correct.
     */
    const granted = await db.userRoleAssignment.createMany({
      data: [{ userId, roleId: role.id }],
      skipDuplicates: true,
    });
    if (granted.count === 0) {
      return;
    }

    await db.auditEvent.create({
      data: {
        userId,
        action: "AUTH_BOOTSTRAP_ROLE_GRANTED",
        entityType: "UserRoleAssignment",
        entityId: userId,
        metadata: {
          roleCode,
          matchedEmail: email.trim().toLowerCase(),
          reason: "BOOTSTRAP_ADMINISTRATOR_EMAIL",
        },
      },
    });

    console.warn(
      `Granted ${roleCode} to ${email} because it matched BOOTSTRAP_ADMINISTRATOR_EMAIL and the user held no role. Clear that variable now that an administrator exists.`,
    );
  } catch (error) {
    console.error("Bootstrap administrator grant failed", error);
  }
}
