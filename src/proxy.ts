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
    return refuse(request);
  }

  return NextResponse.next();
}

const REFUSAL = "This app is reachable only through ATI One.";

/**
 * Says no in the language the caller asked in.
 *
 * A person who types this app's own address gets a browser, and a browser rendering
 * `{"error":"Direct origin access is not allowed."}` reads as a broken deployment rather
 * than as a boundary working. Anything not asking for HTML — an API client, a script, an
 * asset request — keeps the JSON body it can act on.
 *
 * The wording is the contract's own, so somebody who searches for it finds
 * `docs/INTERNAL-APPS.md` rule 8 rather than this file.
 */
function refuse(request: NextRequest): NextResponse {
  const wantsHtml = (request.headers.get("accept") ?? "").includes(
    "text/html",
  );

  if (!wantsHtml) {
    return NextResponse.json({ error: REFUSAL }, { status: 403 });
  }

  return new NextResponse(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ATI Public Holiday Notification</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;
       font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;
       color:#1b2559;background:#f6f8fd}
  main{max-width:32rem;padding:2rem;text-align:center}
  h1{font-size:1.25rem;margin:0 0 .5rem}
  p{margin:0;color:#5a6488}
</style>
</head>
<body>
<main>
  <h1>${REFUSAL}</h1>
  <p>Open it from the ATI One launcher. Reaching this address directly does not
  carry the entitlement check that decides who may use this product.</p>
</main>
</body>
</html>`,
    {
      status: 403,
      headers: {
        "content-type": "text/html; charset=utf-8",
        // Nothing about a refusal is worth keeping, and a cached one would outlive
        // whatever configuration caused it.
        "cache-control": "no-store",
      },
    },
  );
}

/**
 * Everything, and the exclusions live in `proxy` above instead.
 *
 * This was `"/((?!_next/static|_next/image|favicon.ico).*)"`, and it did not match the
 * mount root. `/apps/ph-notification/app/deliveries` was refused; the address a person
 * actually types was served — with or without the header, which is how it was found. A
 * negative-lookahead pattern has to be written against whatever Next hands the matcher,
 * and under `basePath` the root normalises to something that pattern misses.
 *
 * `"/:path*"` has nothing to get wrong. Whether an asset is exempt is then an `if` in
 * TypeScript, next to the reasoning for it, tested by the same file that tests the rest
 * of the guard — rather than a regular expression whose behaviour depends on a
 * normalisation step no test in this repository can see.
 *
 * Static assets are no longer exempt, and that is the point. With the guard on, a direct
 * visitor should not be able to pull this app's chunks either; through the portal every
 * request carries the header, assets included, because the proxy sets it on all of them.
 */
export const config = {
  matcher: ["/:path*"],
};
