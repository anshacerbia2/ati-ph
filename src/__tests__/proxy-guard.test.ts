import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PROXY_PROOF_HEADER, mountedPath } from "@/config/app";
import { proxy } from "@/proxy";

/**
 * Rule 8 of ATI One's internal-app contract: refuse anything that did not come through
 * the portal.
 *
 * ## Why this file exists at all
 *
 * The guard had no test, and its absence let a wrong conclusion stand for a whole
 * session: that `src/proxy.ts` was dead code because there was no `middleware.ts`. In
 * Next 16 `middleware.js` is deprecated and renamed to `proxy.js` — this *is* the file
 * convention, and the guard has been running the whole time. A test says so in a way a
 * memory of an older Next cannot contradict.
 *
 * ## What the guard defends
 *
 * Nothing, while the app publishes no reachable port — rule 6 covers that case. The
 * moment it has one, anybody who can reach it signs in through the same realm, gets a
 * genuine session, and is inside a product the catalogue says they may not open. This
 * header is what closes that gap without dictating where the app is deployed.
 */

const SECRET = "0123456789012345678901234567890123";

function request(
  path: string,
  header?: string,
  accept?: string,
): NextRequest {
  const headers: Record<string, string> = {};
  if (header) headers[PROXY_PROOF_HEADER] = header;
  if (accept) headers.accept = accept;

  return new NextRequest(
    new URL(mountedPath(path), "http://localhost:3005"),
    { headers },
  );
}

const original = {
  trust: process.env.TRUST_ATI_ONE_PROXY,
  secret: process.env.ATI_ONE_PROXY_SECRET,
};

beforeEach(() => {
  process.env.TRUST_ATI_ONE_PROXY = "true";
  process.env.ATI_ONE_PROXY_SECRET = SECRET;
});

afterEach(() => {
  process.env.TRUST_ATI_ONE_PROXY = original.trust;
  process.env.ATI_ONE_PROXY_SECRET = original.secret;
});

describe("ATI One proxy guard", () => {
  it("refuses a request that carries no proof", () => {
    expect(proxy(request("/")).status).toBe(403);
  });

  it("refuses a request whose proof is wrong", () => {
    expect(proxy(request("/", "not-the-secret")).status).toBe(403);
  });

  it("refuses a proof of the right length but the wrong value", () => {
    /*
     * The comparison is constant-time and length-checked first. A same-length mismatch
     * is the case a naive `===` would also catch and a timing-safe compare must not
     * throw on.
     */
    expect(proxy(request("/", "x".repeat(SECRET.length))).status).toBe(403);
  });

  it("admits a request that came through the portal", () => {
    expect(proxy(request("/", SECRET)).status).toBe(200);
  });

  it("admits the liveness endpoint without proof", () => {
    /*
     * The container's own healthcheck runs inside the container and has no secret to
     * present. Without this exemption, turning the guard on marks a healthy container
     * unhealthy — and the deployment that most needs rule 8 is the one that publishes a
     * port, which is the same one running a healthcheck.
     *
     * Exactly one path, and it says nothing but "up". `/api/health` — which reads the
     * database — stays behind the guard.
     */
    expect(proxy(request("/api/health/live")).status).toBe(200);
  });

  it("keeps the deep health endpoint behind the guard", () => {
    expect(proxy(request("/api/health")).status).toBe(403);
  });

  it("lets everything through when the deployment is not behind the portal", () => {
    /*
     * A standalone run has no portal to prove anything. Production readiness refuses a
     * deployment with `TRUST_ATI_ONE_PROXY` unset, so this cannot silently be the
     * production posture.
     */
    process.env.TRUST_ATI_ONE_PROXY = "false";
    expect(proxy(request("/")).status).toBe(200);
  });

  it("tells a person what to do, in a page they can read", async () => {
    /*
     * Somebody who types this app's own address gets a browser, and a browser rendering
     * a JSON error object reads as a broken deployment rather than as a boundary doing
     * its job. The wording is the contract's, so searching for it finds rule 8.
     */
    const response = proxy(
      request("/", undefined, "text/html,application/xhtml+xml"),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain("text/html");
    await expect(response.text()).resolves.toContain(
      "reachable only through ATI One",
    );
  });

  it("keeps answering JSON to anything that did not ask for a page", async () => {
    const response = proxy(request("/api/health", undefined, "*/*"));

    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain(
      "application/json",
    );
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("ATI One"),
    });
  });

  it("refuses when trust is on and no secret is configured", () => {
    /*
     * Fail closed. The alternative — treating a missing secret as "no check" — would
     * make a typo in the variable name indistinguishable from a deliberate opening.
     */
    delete process.env.ATI_ONE_PROXY_SECRET;
    expect(proxy(request("/", SECRET)).status).toBe(403);
  });
});
