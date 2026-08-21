import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  PROXY_PROOF_HEADER,
  stripBasePath,
} from "@/config/app";

/**
 * Rule 8 of ATI One's internal-app contract, in the Next 16 file convention.
 *
 * `middleware.js` is deprecated and renamed to `proxy.js`, so this file — beside `app/`,
 * exporting `proxy` and `config` — is the guard, not a helper waiting to be wired up.
 * Worth stating because the older convention is what most readers will look for, and
 * concluding this is dead code has already cost one investigation.
 */

/**
 * The one path served without proof: the container's own liveness check.
 *
 * It runs inside the container and has nothing to present. Without this exemption,
 * turning the guard on marks a healthy container unhealthy — and the deployment that
 * needs rule 8 is precisely the one that publishes a port and is therefore being
 * health-checked.
 *
 * Exactly this path, and it says nothing but "up". `/api/health`, which reads the
 * database, stays behind the guard.
 *
 * Compared after `stripBasePath` because whether the prefix reaches here depends on how
 * the app is mounted, and a check that is only correct in one of those arrangements is
 * one deployment away from being wrong.
 */
const UNGUARDED_PATH = "/api/health/live";

function validProxyProof(request: NextRequest): boolean {
  if (process.env.TRUST_ATI_ONE_PROXY !== "true") {
    return true;
  }

  const expected = process.env.ATI_ONE_PROXY_SECRET;
  const received = request.headers.get(PROXY_PROOF_HEADER);

  if (!expected || !received) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export function proxy(request: NextRequest) {
  if (stripBasePath(request.nextUrl.pathname) === UNGUARDED_PATH) {
    return NextResponse.next();
  }

  if (!validProxyProof(request)) {
    return NextResponse.json(
      { error: "Direct origin access is not allowed." },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
