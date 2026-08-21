import "server-only";

import { ATI_ONE_APP_ID } from "@/config/app";

/**
 * What this application's cookies are called, and why the shape is not a free choice.
 *
 * ## One hostname is one cookie jar
 *
 * Mounted in ATI One, this app shares `one.atibusinessgroup.com` with the portal and
 * every other internal app, and cookies are separated by neither port nor path prefix.
 * Rule 3 of the internal-app contract asks each app to namespace its own; what makes the
 * *shape* mandatory rather than polite is single logout.
 *
 * When a session ends anywhere in the realm, the portal ends it here too — and for an app
 * whose session *is* a cookie, that means clearing one. Only a response to the browser
 * can do that, and the portal is the layer sending responses on this hostname. It works
 * out which cookies belong to an app from their names alone:
 *
 * ```text
 * /^(?:__Secure-|__Host-)?([a-z0-9][a-z0-9-]*)-app\./
 * ```
 *
 * `ati_ph_session` does not match that, so this app used to be left signed in when
 * everything else signed out — silently, with nothing failing. `ph-notification-app.session`
 * matches, and the captured `ph-notification` is what the portal uses to clear it at the
 * right `Path`.
 *
 * ## `__Secure-` and not `__Host-`
 *
 * `__Host-` is a browser-enforced promise of `Secure`, no `Domain` *and* `Path=/`
 * together, so a `Set-Cookie` carrying it with any other path is dropped — not
 * downgraded, not warned about. These cookies are scoped to the mount path deliberately
 * (see `getLoginCookiePath`), so `__Host-` is illegal here. `__Secure-` keeps the part
 * that matters — the cookie cannot be set over plain http — and gives up host pinning,
 * which was never a boundary between apps sharing one hostname anyway.
 *
 * The prefix is dropped when the deployment is not https, because a browser rejects it
 * outright over http and local development would have no session at all.
 */

/**
 * The public address, read directly rather than through `getServerEnv`.
 *
 * `PUBLIC_APP_URL` is declared and validated in the schema like everything else; what is
 * avoided here is *depending* on the whole of it. A cookie name needs one fact — is this
 * deployment https — and pulling the full schema in to learn it makes these functions
 * unusable anywhere the database and Keycloak variables are not also set, which includes
 * every test of them. `resolveEmailAutomaticDeliveryRelease` and
 * `evaluateProductionReadiness` take the same shape for the same reason.
 */
function securePrefix(publicAppUrl?: string): string {
  const url = publicAppUrl ?? process.env.PUBLIC_APP_URL ?? "";
  return url.startsWith("https://") ? "__Secure-" : "";
}

export function sessionCookieName(publicAppUrl?: string): string {
  return `${securePrefix(publicAppUrl)}${ATI_ONE_APP_ID}-app.session`;
}

export function loginCookieName(publicAppUrl?: string): string {
  return `${securePrefix(publicAppUrl)}${ATI_ONE_APP_ID}-app.login`;
}

/**
 * Names written before the convention above, read but never written.
 *
 * Without this, deploying the rename signs everybody out at once — which is not a fault,
 * but it is an avoidable one, and the portal's own session module makes the same
 * allowance for the same reason. Delete these once no live session predates the rename.
 */
const LEGACY_SESSION_COOKIE = "ati_ph_session";
const LEGACY_LOGIN_COOKIE = "ati_ph_login";

/** Every name a session may arrive under, current first. */
export function sessionCookieNames(publicAppUrl?: string): string[] {
  return [sessionCookieName(publicAppUrl), LEGACY_SESSION_COOKIE];
}

/** Every name a login handshake may arrive under, current first. */
export function loginCookieNames(publicAppUrl?: string): string[] {
  return [loginCookieName(publicAppUrl), LEGACY_LOGIN_COOKIE];
}

/** The first of `names` present in the jar, or undefined. */
export function readFirst(
  read: (name: string) => string | undefined,
  names: readonly string[],
): string | undefined {
  for (const name of names) {
    const value = read(name);
    if (value !== undefined) return value;
  }

  return undefined;
}
