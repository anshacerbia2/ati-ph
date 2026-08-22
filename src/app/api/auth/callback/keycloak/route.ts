import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

import { verifyAccessToken } from "@/auth/access-token";
import { applyBootstrapGrant } from "@/auth/bootstrap-grant";
import { openLoginState } from "@/auth/login-state";
import {
  browserUrl,
  getCallbackUrl,
  getLoginCookiePath,
  getOidcConfiguration,
  oidc,
} from "@/auth/oidc";
import { createSession } from "@/auth/session";
import {
  loginCookieName,
  loginCookieNames,
  readFirst,
  sessionCookieName,
} from "@/auth/cookie-names";
import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";

const claimsSchema = z
  .object({
    sub: z.string().min(1),
    email: z.string().email(),
    name: z.string().optional(),
    preferred_username: z.string().optional(),
    sid: z.string().min(1).optional(),
  })
  .loose();

export async function GET(request: NextRequest) {
  const providerError = request.nextUrl.searchParams.get("error");
  if (providerError) {
    // `browserUrl`, not `request.url` — see the note there. This is the branch the
    // silent probe takes when nobody is signed in, so it runs on every framed load
    // that has no session yet, which is the first one.
    const loginPage = browserUrl("/login");
    loginPage.searchParams.set("reason", providerError);
    return NextResponse.redirect(loginPage);
  }

  try {
    const env = getServerEnv();
    const sealedState = readFirst(
      (name) => request.cookies.get(name)?.value,
      loginCookieNames(),
    );
    if (!sealedState) {
      return NextResponse.json({ error: "Missing login state." }, { status: 400 });
    }

    const loginState = await openLoginState(sealedState);
    const configuration = await getOidcConfiguration();
    const callbackUrl = new URL(getCallbackUrl());
    callbackUrl.search = request.nextUrl.search;
    const tokens = await oidc.authorizationCodeGrant(
      configuration,
      callbackUrl,
      {
        expectedState: loginState.state,
        expectedNonce: loginState.nonce,
        pkceCodeVerifier: loginState.codeVerifier,
        idTokenExpected: true,
      },
    );
    await verifyAccessToken(
      tokens.access_token,
      configuration,
      env.KEYCLOAK_CLIENT_ID,
    );
    const claims = claimsSchema.parse(tokens.claims());

    const user = await db.user.upsert({
      where: { externalSubject: claims.sub },
      create: {
        externalSubject: claims.sub,
        email: claims.email.toLowerCase(),
        displayName: claims.name ?? claims.preferred_username,
      },
      update: {
        email: claims.email.toLowerCase(),
        displayName: claims.name ?? claims.preferred_username,
      },
    });
    /*
     * Before the session is created, so the very first request this person makes already
     * carries the role. Granting after would leave one page load in which an
     * administrator is refused every screen — which reads as the grant not working.
     */
    await applyBootstrapGrant(user.id, user.email);

    const session = await createSession(
      user.id,
      {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        idToken: tokens.id_token,
        expiresAt:
          Math.floor(Date.now() / 1_000) + (tokens.expires_in ?? 300),
      },
      { keycloakSid: claims.sid, keycloakSub: claims.sub },
    );

    await db.auditEvent.create({
      data: {
        userId: user.id,
        action: "AUTH_LOGIN",
        entityType: "AuthSession",
        entityId: session.id,
      },
    });

    const returnUrl = new URL(loginState.returnTo, "http://ati-ph.local");
    const destination = browserUrl(returnUrl.pathname);
    destination.search = returnUrl.search;
    destination.hash = returnUrl.hash;
    const response = NextResponse.redirect(destination);
    response.cookies.set(sessionCookieName(), session.id, {
      httpOnly: true,
      secure: env.PUBLIC_APP_URL.startsWith("https://"),
      sameSite: "lax",
      path: getLoginCookiePath(),
      expires: session.expiresAt,
    });
    response.cookies.set(loginCookieName(), "", {
      httpOnly: true,
      secure: env.PUBLIC_APP_URL.startsWith("https://"),
      sameSite: "lax",
      path: getLoginCookiePath(),
      maxAge: 0,
    });
    return response;
  } catch (error) {
    console.error("Keycloak callback failed", error);
    return NextResponse.json(
      { error: "Keycloak callback could not be validated." },
      { status: 400 },
    );
  }
}
