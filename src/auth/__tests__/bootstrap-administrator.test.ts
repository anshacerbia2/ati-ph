import { describe, expect, it } from "vitest";

import { bootstrapRoleFor } from "@/auth/bootstrap-administrator";

/**
 * The one rule that grants a role without a human deciding it, so every way it could
 * grant too much is a test.
 */

const CONFIGURED = "ansha.cerbia@atibusinessgroup.com";

describe("bootstrapRoleFor", () => {
  it("grants ADMINISTRATOR to the configured address on a first sign-in", () => {
    expect(
      bootstrapRoleFor({
        email: CONFIGURED,
        existingRoleCount: 0,
        configuredEmail: CONFIGURED,
      }),
    ).toBe("ADMINISTRATOR");
  });

  it("grants nothing once the user holds any role", () => {
    /*
     * This is what makes it a bootstrap. Without it, an administrator demoted from
     * ADMINISTRATOR to AUDITOR would be promoted back by their next sign-in, and the
     * demotion would appear to have worked until somebody checked.
     */
    expect(
      bootstrapRoleFor({
        email: CONFIGURED,
        existingRoleCount: 1,
        configuredEmail: CONFIGURED,
      }),
    ).toBeNull();
  });

  it("grants nothing to any other address", () => {
    expect(
      bootstrapRoleFor({
        email: "someone.else@atibusinessgroup.com",
        existingRoleCount: 0,
        configuredEmail: CONFIGURED,
      }),
    ).toBeNull();
  });

  it("grants nothing when the variable is unset, blank, or whitespace", () => {
    /*
     * The default has to be "nobody". A missing value failing closed is loud and
     * recoverable; failing open would hand ADMINISTRATOR to whoever signed in first.
     */
    for (const configuredEmail of [undefined, "", "   "]) {
      expect(
        bootstrapRoleFor({
          email: CONFIGURED,
          existingRoleCount: 0,
          configuredEmail,
        }),
      ).toBeNull();
    }
  });

  it("matches regardless of case and surrounding whitespace", () => {
    // An identity provider may return either casing for the same mailbox, and an
    // operator editing `.env` may leave a trailing space.
    expect(
      bootstrapRoleFor({
        email: "  Ansha.Cerbia@AtiBusinessGroup.com ",
        existingRoleCount: 0,
        configuredEmail: `  ${CONFIGURED.toUpperCase()}  `,
      }),
    ).toBe("ADMINISTRATOR");
  });

  it("does not fold dots or strip plus-addresses", () => {
    /*
     * `anshacerbia@` and `ansha.cerbia+x@` are the same inbox at Gmail and different
     * addresses everywhere else. Treating them as equal here would grant ADMINISTRATOR
     * to an address the operator never typed — the one outcome this rule must not have.
     */
    expect(
      bootstrapRoleFor({
        email: "anshacerbia@atibusinessgroup.com",
        existingRoleCount: 0,
        configuredEmail: CONFIGURED,
      }),
    ).toBeNull();

    expect(
      bootstrapRoleFor({
        email: "ansha.cerbia+admin@atibusinessgroup.com",
        existingRoleCount: 0,
        configuredEmail: CONFIGURED,
      }),
    ).toBeNull();
  });
});
