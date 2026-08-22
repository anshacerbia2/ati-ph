import type { RoleCode } from "@/auth/authorization-catalog";

/**
 * Who, if anyone, becomes an administrator by signing in.
 *
 * ## What this is for
 *
 * A fresh database has roles and permissions but nobody holding them, so the first person
 * to sign in lands on a product where every screen refuses them — including the screen
 * that grants roles. Somebody has to be let in from outside the application, and the
 * choices are a seed that writes a named person into the estate, a CLI nobody will have
 * on the production host, or one line of configuration. This is the line.
 *
 * ## The two conditions, and why both
 *
 * The address must match, and **the user must hold no role at all**. The second is what
 * makes this a bootstrap rather than a standing grant: once anybody has been given
 * anything, this stops applying to them.
 *
 * It also has a consequence worth stating plainly, because it is the kind that is
 * discovered at the worst time. An administrator cannot demote the bootstrap account
 * while the variable is set — strip its last role and the next sign-in grants
 * ADMINISTRATOR again, silently, because from here that is indistinguishable from a
 * first sign-in. **Clear the variable once a human administrator exists.** The deployment
 * documentation says so too; this comment is here because whoever reads the code is the
 * one who has to believe it.
 *
 * ## Matching
 *
 * Case-insensitive and trimmed, because an identity provider is free to return
 * `Ansha.Cerbia@…` today and `ansha.cerbia@…` tomorrow and both are the same mailbox.
 * Nothing else is normalised: no plus-address stripping, no dot-folding, no domain
 * aliasing. Those are Gmail conventions rather than email ones, and a rule that grants
 * administrator to an address the operator did not type is worse than one that grants
 * nothing.
 *
 * A blank or unset variable matches nobody. That is the default and the safe direction:
 * the failure mode of a missing value is "no one can get in", which is loud and
 * recoverable, against "somebody unexpected is an administrator", which is neither.
 */
export function bootstrapRoleFor(input: {
  /** The address the identity provider asserted for this sign-in. */
  email: string;
  /** How many roles the user already holds. Zero is the only value that qualifies. */
  existingRoleCount: number;
  /** `BOOTSTRAP_ADMINISTRATOR_EMAIL`, or undefined when unset. */
  configuredEmail: string | undefined;
}): RoleCode | null {
  const configured = input.configuredEmail?.trim().toLowerCase();
  if (!configured) {
    return null;
  }

  if (input.existingRoleCount > 0) {
    return null;
  }

  return input.email.trim().toLowerCase() === configured
    ? "ADMINISTRATOR"
    : null;
}
