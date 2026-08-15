import { NextRequest, NextResponse } from "next/server";

import { getLoginCookiePath } from "@/auth/oidc";
import { revokeSession } from "@/auth/session";
import { SESSION_COOKIE_NAME } from "@/config/app";
import { getServerEnv } from "@/lib/env";

export async function POST(request: NextRequest) {
  const env = getServerEnv();
  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  await revokeSession(sessionId, "user_logout");

  const response = NextResponse.redirect(new URL(env.ATI_ONE_RETURN_URL), 303);
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: env.PUBLIC_APP_URL.startsWith("https://"),
    sameSite: "lax",
    path: getLoginCookiePath(),
    maxAge: 0,
  });
  return response;
}
