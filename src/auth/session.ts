import "server-only";

import { randomBytes } from "node:crypto";
import type { AuthSession, User } from "@prisma/client";
import { cookies } from "next/headers";
import { z } from "zod";

import { verifyAccessToken } from "@/auth/access-token";
import { openPayload, sealPayload } from "@/auth/crypto";
import { getOidcConfiguration, oidc } from "@/auth/oidc";
import {
  accessTokenNeedsRefresh,
  TokenRefreshCoordinator,
  type RefreshOutcome,
} from "@/auth/token-refresher";
import { SESSION_COOKIE_NAME } from "@/config/app";
import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";

const tokenPayloadSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  idToken: z.string().min(1).optional(),
  expiresAt: z.number().int().positive().optional(),
});

export type TokenPayload = z.infer<typeof tokenPayloadSchema>;

export type CurrentSession = {
  id: string;
  user: User;
  expiresAt: Date;
};

type SessionRecord = AuthSession & { user: User };

type SessionIdentity = {
  keycloakSid?: string;
  keycloakSub: string;
};

export type SessionRevocationReason =
  | "user_logout"
  | "refresh_failed"
  | "refresh_token_missing"
  | "token_payload_invalid"
  | "refresh_result_unusable"
  | "user_inactive";

const refreshCoordinator = new TokenRefreshCoordinator();

export function newSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(
  userId: string,
  tokens: TokenPayload,
  identity: SessionIdentity,
): Promise<{ id: string; expiresAt: Date }> {
  const env = getServerEnv();
  const id = newSessionId();
  const expiresAt = new Date(Date.now() + env.SESSION_MAX_AGE_SECONDS * 1_000);
  const tokensEncrypted = await sealPayload(tokens, env.SESSION_SECRET);

  await db.authSession.create({
    data: {
      id,
      userId,
      tokensEncrypted,
      keycloakSid: identity.keycloakSid,
      keycloakSub: identity.keycloakSub,
      keycloakClientId: env.KEYCLOAK_CLIENT_ID,
      expiresAt,
    },
  });

  return { id, expiresAt };
}

export async function getCurrentSession(): Promise<CurrentSession | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) {
    return null;
  }

  const session = await resolveFreshSession(sessionId);
  return session ? toCurrentSession(session) : null;
}

export async function getSessionTokens(
  sessionId: string,
): Promise<TokenPayload | null> {
  const session = await resolveFreshSession(sessionId);
  if (!session) {
    return null;
  }

  return readTokenPayload(session.tokensEncrypted).catch(() => null);
}

export async function revokeSession(
  sessionId: string | undefined,
  reason: SessionRevocationReason,
): Promise<void> {
  if (!sessionId) {
    return;
  }

  const session = await db.authSession.findUnique({ where: { id: sessionId } });
  if (!session || session.revokedAt) {
    return;
  }

  const revoked = await db.authSession.updateMany({
    where: { id: session.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (revoked.count > 0) {
    await recordSessionAudit(session, reason);
  }
}

async function resolveFreshSession(
  sessionId: string,
): Promise<SessionRecord | null> {
  let session = await findSession(sessionId);
  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  if (!session.user.isActive) {
    await revokeSessionRecordIfCurrent(session, "user_inactive");
    return null;
  }

  let tokens: TokenPayload;
  try {
    tokens = await readTokenPayload(session.tokensEncrypted);
  } catch {
    await revokeSessionRecordIfCurrent(session, "token_payload_invalid");
    return null;
  }

  const env = getServerEnv();
  const nowSeconds = Math.floor(Date.now() / 1_000);
  if (
    !accessTokenNeedsRefresh(
      tokens.expiresAt,
      nowSeconds,
      env.ACCESS_TOKEN_REFRESH_SKEW_SECONDS,
    )
  ) {
    return session;
  }

  const sessionForRefresh = session;
  const tokensForRefresh = tokens;
  await refreshCoordinator.refresh(sessionForRefresh.id, () =>
    refreshPersistedSession(sessionForRefresh, tokensForRefresh),
  );

  session = await findSession(sessionId);
  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  try {
    tokens = await readTokenPayload(session.tokensEncrypted);
  } catch {
    await revokeSessionRecordIfCurrent(session, "token_payload_invalid");
    return null;
  }

  if (
    accessTokenNeedsRefresh(
      tokens.expiresAt,
      Math.floor(Date.now() / 1_000),
      env.ACCESS_TOKEN_REFRESH_SKEW_SECONDS,
    )
  ) {
    await revokeSessionRecordIfCurrent(session, "refresh_result_unusable");
    return null;
  }

  return session.user.isActive ? session : null;
}

async function refreshPersistedSession(
  session: SessionRecord,
  currentTokens: TokenPayload,
): Promise<RefreshOutcome> {
  if (!currentTokens.refreshToken) {
    const revoked = await revokeSessionRecordIfCurrent(
      session,
      "refresh_token_missing",
    );
    return revoked ? "revoked" : "superseded";
  }

  try {
    const env = getServerEnv();
    const configuration = await getOidcConfiguration();
    const refreshed = await oidc.refreshTokenGrant(
      configuration,
      currentTokens.refreshToken,
    );
    if (!refreshed.access_token) {
      throw new Error("Keycloak returned no access token during refresh.");
    }

    await verifyAccessToken(
      refreshed.access_token,
      configuration,
      env.KEYCLOAK_CLIENT_ID,
    );

    const refreshedTokens: TokenPayload = {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? currentTokens.refreshToken,
      idToken: refreshed.id_token ?? currentTokens.idToken,
      expiresAt:
        Math.floor(Date.now() / 1_000) + (refreshed.expires_in ?? 300),
    };
    const tokensEncrypted = await sealPayload(
      refreshedTokens,
      env.SESSION_SECRET,
    );
    const now = new Date();
    const updated = await db.authSession.updateMany({
      where: {
        id: session.id,
        updatedAt: session.updatedAt,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        tokensEncrypted,
        lastRefreshedAt: now,
        refreshVersion: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      return "superseded";
    }

    console.info("ATI PH session access token refreshed.");
    return "refreshed";
  } catch (error) {
    const revoked = await revokeSessionRecordIfCurrent(
      session,
      "refresh_failed",
    );
    if (revoked) {
      console.warn(
        `ATI PH session revoked after refresh refusal: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
    return revoked ? "revoked" : "superseded";
  }
}

async function revokeSessionRecordIfCurrent(
  session: AuthSession,
  reason: SessionRevocationReason,
): Promise<boolean> {
  const revoked = await db.authSession.updateMany({
    where: {
      id: session.id,
      updatedAt: session.updatedAt,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  if (revoked.count === 0) {
    return false;
  }

  await recordSessionAudit(session, reason);
  return true;
}

async function recordSessionAudit(
  session: Pick<AuthSession, "id" | "userId">,
  reason: SessionRevocationReason,
): Promise<void> {
  const action = reason === "user_logout" ? "AUTH_LOGOUT" : "AUTH_SESSION_REVOKED";
  await db.auditEvent
    .create({
      data: {
        userId: session.userId,
        action,
        entityType: "AuthSession",
        entityId: session.id,
        metadata: { reason },
      },
    })
    .catch(() => {
      console.error("Unable to persist ATI PH session audit event.");
    });
}

function findSession(sessionId: string): Promise<SessionRecord | null> {
  return db.authSession.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
}

function readTokenPayload(value: string): Promise<TokenPayload> {
  return openPayload(
    value,
    getServerEnv().SESSION_SECRET,
    tokenPayloadSchema,
  );
}

function toCurrentSession(session: SessionRecord): CurrentSession {
  return {
    id: session.id,
    user: session.user,
    expiresAt: session.expiresAt,
  };
}
