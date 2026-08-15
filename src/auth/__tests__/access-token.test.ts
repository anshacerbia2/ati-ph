import { describe, expect, it } from "vitest";

import {
  AccessTokenValidationError,
  assertAccessTokenClaims,
} from "@/auth/access-token";

const expectedClientId = "ati-one-portal";

function validClaims(overrides: Record<string, unknown> = {}) {
  return {
    iss: "https://one.atibusinessgroup.com/auth/realms/ati-one",
    exp: Math.floor(Date.now() / 1_000) + 300,
    typ: "Bearer",
    azp: expectedClientId,
    ...overrides,
  };
}

describe("assertAccessTokenClaims", () => {
  it("accepts a bearer access token issued to the configured client", () => {
    expect(() =>
      assertAccessTokenClaims(validClaims(), expectedClientId),
    ).not.toThrow();
  });

  it("rejects a token issued to another client", () => {
    expect(() =>
      assertAccessTokenClaims(
        validClaims({ azp: "another-client" }),
        expectedClientId,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<AccessTokenValidationError>>({
        reason: "wrong_client",
      }),
    );
  });

  it("rejects a token without azp", () => {
    expect(() =>
      assertAccessTokenClaims(validClaims({ azp: undefined }), expectedClientId),
    ).toThrowError(
      expect.objectContaining<Partial<AccessTokenValidationError>>({
        reason: "invalid_claims",
      }),
    );
  });

  it("rejects an ID or refresh token", () => {
    expect(() =>
      assertAccessTokenClaims(validClaims({ typ: "ID" }), expectedClientId),
    ).toThrowError(
      expect.objectContaining<Partial<AccessTokenValidationError>>({
        reason: "invalid_claims",
      }),
    );
  });
});
