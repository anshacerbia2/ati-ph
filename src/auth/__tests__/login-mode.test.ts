import { describe, expect, it } from "vitest";

import { shouldUseSilentSso } from "@/auth/login-mode";

describe("Keycloak login mode", () => {
  it("uses silent SSO for an iframe navigation", () => {
    expect(
      shouldUseSilentSso({
        fetchDestination: "iframe",
        interactiveRequested: false,
      }),
    ).toBe(true);
  });

  it("uses normal OIDC login for a top-level document", () => {
    expect(
      shouldUseSilentSso({
        fetchDestination: "document",
        interactiveRequested: false,
      }),
    ).toBe(false);
  });

  it("never uses silent SSO when interactive login is requested", () => {
    expect(
      shouldUseSilentSso({
        fetchDestination: "iframe",
        interactiveRequested: true,
      }),
    ).toBe(false);
  });
});
