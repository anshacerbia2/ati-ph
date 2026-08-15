import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from "jose";
import type { Configuration } from "openid-client";
import { z } from "zod";

const accessTokenClaimsSchema = z.object({
  iss: z.string().min(1),
  exp: z.number().int().positive(),
  typ: z.literal("Bearer"),
  azp: z.string().min(1),
});

type AccessTokenFailure =
  | "missing_token"
  | "missing_jwks_uri"
  | "invalid_claims"
  | "wrong_client";

export class AccessTokenValidationError extends Error {
  constructor(readonly reason: AccessTokenFailure) {
    super("Keycloak access token failed validation.");
    this.name = "AccessTokenValidationError";
  }
}

const remoteKeySets = new Map<
  string,
  ReturnType<typeof createRemoteJWKSet>
>();

function getRemoteKeySet(jwksUri: string) {
  const existing = remoteKeySets.get(jwksUri);
  if (existing) {
    return existing;
  }

  const created = createRemoteJWKSet(new URL(jwksUri), {
    cooldownDuration: 5_000,
    cacheMaxAge: 10 * 60 * 1_000,
  });
  remoteKeySets.set(jwksUri, created);
  return created;
}

export function assertAccessTokenClaims(
  payload: JWTPayload,
  expectedClientId: string,
): void {
  const result = accessTokenClaimsSchema.safeParse(payload);
  if (!result.success) {
    throw new AccessTokenValidationError("invalid_claims");
  }

  if (result.data.azp !== expectedClientId) {
    throw new AccessTokenValidationError("wrong_client");
  }
}

export async function verifyAccessToken(
  accessToken: string | undefined,
  configuration: Configuration,
  expectedClientId: string,
): Promise<void> {
  if (!accessToken) {
    throw new AccessTokenValidationError("missing_token");
  }

  const metadata = configuration.serverMetadata();
  if (!metadata.jwks_uri) {
    throw new AccessTokenValidationError("missing_jwks_uri");
  }

  const { payload } = await jwtVerify(
    accessToken,
    getRemoteKeySet(metadata.jwks_uri),
    {
      algorithms: ["RS256"],
      issuer: metadata.issuer,
      clockTolerance: 5,
    },
  );
  assertAccessTokenClaims(payload, expectedClientId);
}
