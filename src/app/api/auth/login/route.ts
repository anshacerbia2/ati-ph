import { NextRequest, NextResponse } from "next/server";

import { sealLoginState } from "@/auth/login-state";
import { shouldUseSilentSso } from "@/auth/login-mode";
import {
  getCallbackUrl,
  getLoginCookiePath,
  getOidcConfiguration,
  oidc,
} from "@/auth/oidc";
import { LOGIN_COOKIE_NAME, safeReturnTo } from "@/config/app";
import { getServerEnv } from "@/lib/env";

export async function GET(request: NextRequest) {
  try {
    const env = getServerEnv();
    const configuration = await getOidcConfiguration();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
    const interactiveRequested =
      request.nextUrl.searchParams.get("interactive") === "1";
    const silentSso = shouldUseSilentSso({
      fetchDestination: request.headers.get("sec-fetch-dest"),
      interactiveRequested,
    });

    const authorizationUrl = oidc.buildAuthorizationUrl(configuration, {
      redirect_uri: getCallbackUrl(),
      response_type: "code",
      scope: "openid profile email",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      nonce,
      ...(silentSso ? { prompt: "none" } : {}),
    });

    const loginState = await sealLoginState({
      state,
      nonce,
      codeVerifier,
      returnTo,
      expiresAt: Date.now() + 10 * 60 * 1_000,
    });
    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(LOGIN_COOKIE_NAME, loginState, {
      httpOnly: true,
      secure: env.PUBLIC_APP_URL.startsWith("https://"),
      sameSite: "lax",
      path: getLoginCookiePath(),
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    console.error("Unable to start Keycloak login", error);
    return NextResponse.json(
      { error: "Authentication is not configured or Keycloak is unavailable." },
      { status: 503 },
    );
  }
}
