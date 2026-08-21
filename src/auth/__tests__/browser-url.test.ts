import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Only `PUBLIC_APP_URL` is stubbed, and deliberately so.
 *
 * `getServerEnv` parses the entire schema, so the alternative is a fixture of every
 * variable the application declares — which would have to be maintained in step with
 * the schema and would say nothing about the one line under test. `server-env.test.ts`
 * is where the schema itself is checked.
 */
vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({ PUBLIC_APP_URL: process.env.PUBLIC_APP_URL }),
}));

import { browserUrl } from "@/auth/oidc";

/**
 * A redirect must name the address the browser is using, never the one this process
 * was reached on.
 *
 * ## The failure
 *
 * Mounted in ATI One, the portal proxies to this app, so `request.url` is the app's own
 * origin — `http://localhost:3005` — while the browser is at `http://localhost:3000`.
 * Both redirects in the OIDC callback were built from `request.url`, so a framed load
 * with no session took the `login_required` branch and answered
 * `Location: http://localhost:3005/apps/ph-notification/app/login`.
 *
 * What that cost was an afternoon, because every hop reported success. The catalogue
 * row, the proxy, the realm and the app were each verified correct in turn; the only
 * symptom was a grey frame and one CSP line naming an address that appears nowhere in
 * either repository, because it was assembled at runtime from the socket.
 *
 * The blocked case is the lucky one. Where `frame-src` does not stop it, the redirect
 * succeeds and lands the person on the app's direct address — outside the portal, past
 * the entitlement check, carrying a session cookie set for an origin the browser is no
 * longer on and therefore never sends. That is an endless sign-in loop, and it looks
 * like a session bug rather than a redirect bug.
 *
 * These assertions are on the origin. The path is `mountedPath`'s job and is covered
 * where that lives; what cannot be allowed to regress is which host ends up in a
 * `Location` header.
 */

const MOUNTED = "http://localhost:3000/apps/ph-notification/app";

const original = process.env.PUBLIC_APP_URL;

beforeEach(() => {
  vi.resetModules();
  process.env.PUBLIC_APP_URL = MOUNTED;
});

afterEach(() => {
  process.env.PUBLIC_APP_URL = original;
});

describe("browserUrl", () => {
  it("uses the address the browser is on, not the port this process binds", () => {
    expect(browserUrl("/login").origin).toBe("http://localhost:3000");
  });

  it("keeps the mount prefix and does not double it", () => {
    /*
     * `PUBLIC_APP_URL` already ends in the mount path and `mountedPath` adds it again,
     * so taking the whole URL as the base rather than its origin would produce
     * `/apps/ph-notification/app/apps/ph-notification/app/login` — a 404 that reads as
     * a routing mistake rather than a base-URL one.
     */
    expect(browserUrl("/login").pathname).toBe(
      "/apps/ph-notification/app/login",
    );
  });

  it("returns the mount root for the default path", () => {
    expect(browserUrl().toString()).toBe(`${MOUNTED}/`);
  });

  it("carries the scheme, so a deployed origin stays https", () => {
    // `secure` on the session cookie is decided separately, but a redirect that
    // downgraded the scheme would strand the browser on http and lose the cookie.
    process.env.PUBLIC_APP_URL =
      "https://one.atibusinessgroup.com/apps/ph-notification/app";

    expect(browserUrl("/login").origin).toBe(
      "https://one.atibusinessgroup.com",
    );
  });
});
