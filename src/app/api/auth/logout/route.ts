import { NextRequest, NextResponse } from "next/server";

import { getLoginCookiePath } from "@/auth/oidc";
import { revokeSession } from "@/auth/session";
import {
  readFirst,
  sessionCookieNames,
} from "@/auth/cookie-names";
import { getServerEnv } from "@/lib/env";

export async function POST(request: NextRequest) {
  const env = getServerEnv();
  const sessionId = readFirst(
    (name) => request.cookies.get(name)?.value,
    sessionCookieNames(),
  );
  await revokeSession(sessionId, "user_logout");

  const response = NextResponse.redirect(new URL(env.ATI_ONE_RETURN_URL), 303);

  /*
   * Every name a session may be under, not only the one written today.
   *
   * Signing out has to clear what the browser is actually carrying. Clearing only the
   * current name would leave a pre-rename cookie in the jar, and the next request would
   * find it and consider the person signed in — a sign-out that reports success and ends
   * nothing.
   */
  for (const name of sessionCookieNames()) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: env.PUBLIC_APP_URL.startsWith("https://"),
      sameSite: "lax",
      path: getLoginCookiePath(),
      maxAge: 0,
    });
  }

  return response;
}
