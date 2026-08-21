import { describe, expect, it } from "vitest";

import {
  loginCookieName,
  loginCookieNames,
  readFirst,
  sessionCookieName,
  sessionCookieNames,
} from "@/auth/cookie-names";

/**
 * The names have to satisfy a regular expression in another repository.
 *
 * ATI One clears an internal app's cookies at sign-out by recognising them from their
 * names alone — it cannot ask, and there is no registry to consult. `ati_ph_session` did
 * not match, so this app stayed signed in when everything else signed out, with nothing
 * failing anywhere.
 *
 * The pattern is copied here deliberately rather than imported: this repository cannot
 * depend on the portal's package, and a copy that is asserted is the only kind that
 * cannot drift silently. Source: `shared/src/session-cookie.ts` in `ai-portal`.
 */
const PORTAL_INTERNAL_APP_COOKIE =
  /^(?:__Secure-|__Host-)?([a-z0-9][a-z0-9-]*)-app\./;

/** Must equal the product id in ATI One's catalogue, and the `<id>` in `/apps/<id>/app`. */
const APP_ID = "ph-notification";

const LOCAL = "http://localhost:3000/apps/ph-notification/app";
const DEPLOYED = "https://one.atibusinessgroup.com/apps/ph-notification/app";

describe("cookie names", () => {
  it("matches the pattern the portal uses to recognise this app", () => {
    for (const url of [LOCAL, DEPLOYED]) {
      for (const name of [sessionCookieName(url), loginCookieName(url)]) {
        const match = PORTAL_INTERNAL_APP_COOKIE.exec(name);

        expect(
          match,
          `${name} must be recognisable to the portal`,
        ).not.toBeNull();
        expect(match?.[1]).toBe(APP_ID);
      }
    }
  });

  it("does not collide with the namespace the portal reserves", () => {
    /*
     * Anything starting with `ati_one` belongs to the portal, and its proxy strips those
     * before this app sees them. Writing one would be invisible here and disruptive
     * there.
     */
    for (const name of [
      ...sessionCookieNames(DEPLOYED),
      ...loginCookieNames(DEPLOYED),
    ]) {
      expect(name.startsWith("ati_one")).toBe(false);
    }
  });

  it("drops the __Secure- prefix over plain http", () => {
    /*
     * A browser rejects `__Secure-` outright over http — not downgraded, not warned
     * about — so local development would have no session at all.
     */
    expect(sessionCookieName(LOCAL)).toBe("ph-notification-app.session");
    expect(loginCookieName(LOCAL)).toBe("ph-notification-app.login");
  });

  it("adds the __Secure- prefix over https", () => {
    expect(sessionCookieName(DEPLOYED)).toBe(
      "__Secure-ph-notification-app.session",
    );
    expect(loginCookieName(DEPLOYED)).toBe(
      "__Secure-ph-notification-app.login",
    );
  });

  it("never uses __Host-, which the mount-path scope makes illegal", () => {
    /*
     * `__Host-` promises `Secure`, no `Domain` *and* `Path=/` together. These cookies are
     * scoped to the mount path so the `Cookie` header does not grow with every app a
     * person has opened, and a `Set-Cookie` breaking that promise is dropped silently.
     */
    for (const url of [LOCAL, DEPLOYED]) {
      for (const name of [sessionCookieName(url), loginCookieName(url)]) {
        expect(name.startsWith("__Host-")).toBe(false);
      }
    }
  });

  it("keeps reading the pre-rename names, and never writes them", () => {
    /*
     * Without the fallback, deploying the rename signs everybody out at once. The write
     * path must not use them, or the rename never completes.
     */
    expect(sessionCookieNames(DEPLOYED)).toContain("ati_ph_session");
    expect(loginCookieNames(DEPLOYED)).toContain("ati_ph_login");
    expect(sessionCookieNames(DEPLOYED)[0]).toBe(sessionCookieName(DEPLOYED));
    expect(loginCookieNames(DEPLOYED)[0]).toBe(loginCookieName(DEPLOYED));
  });

  it("reads the first name present and prefers the current one", () => {
    const jar: Record<string, string> = { ati_ph_session: "legacy" };
    const read = (name: string) => jar[name];

    expect(readFirst(read, sessionCookieNames(LOCAL))).toBe("legacy");

    jar[sessionCookieName(LOCAL)] = "current";
    expect(readFirst(read, sessionCookieNames(LOCAL))).toBe("current");
  });

  it("treats an unset public address as not https", () => {
    /*
     * The safe direction: no `__Secure-` means the cookie is still written and the app
     * still works, where a wrongly-added prefix would be dropped by the browser and
     * produce a sign-in that silently never completes.
     */
    expect(sessionCookieName("")).toBe("ph-notification-app.session");
  });
});
