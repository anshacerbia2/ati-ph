import "server-only";

import * as oidc from "openid-client";

import { APP_BASE_PATH, mountedPath } from "@/config/app";
import { getServerEnv } from "@/lib/env";

let configurationPromise: Promise<oidc.Configuration> | undefined;

export function getOidcConfiguration(): Promise<oidc.Configuration> {
  const env = getServerEnv();

  configurationPromise ??= oidc.discovery(
    new URL(env.KEYCLOAK_ISSUER),
    env.KEYCLOAK_CLIENT_ID,
    { client_secret: env.KEYCLOAK_CLIENT_SECRET },
    oidc.ClientSecretPost(env.KEYCLOAK_CLIENT_SECRET),
  );

  return configurationPromise;
}

export function getCallbackUrl(): string {
  const env = getServerEnv();
  return env.OIDC_CALLBACK_URL ??
    new URL(
      "api/auth/callback/keycloak",
      ensureTrailingSlash(env.PUBLIC_APP_URL),
    ).toString();
}

/**
 * A redirect target, at the address the browser is actually using.
 *
 * ## The failure this exists to prevent
 *
 * Both redirects in the OIDC callback were built as `new URL(path, request.url)`, and
 * `request.url` is the address *this process* was reached on. Mounted in ATI One that is
 * the app's own origin — the portal proxies to it — so the app answered the callback
 * with `Location: http://localhost:3005/…` while the browser was at
 * `http://localhost:3000/apps/ph-notification/app`. Forwarding `Host` does not help;
 * the value came from the server's own origin either way.
 *
 * Two consequences, and the harmless-looking one is the dangerous one:
 *
 *   - The portal's `frame-src 'self'` refuses the cross-origin navigation, so the frame
 *     goes grey with one CSP line naming an address nothing in either repository
 *     contains. Every other hop reports success.
 *   - Unblocked — a standalone browser tab, or a portal with a laxer policy — it
 *     *succeeds*, and the person lands on the app's direct address outside the portal,
 *     without the entitlement check, carrying a session cookie set for the other origin
 *     and therefore not sent. That is a sign-in loop wearing a frame-escape costume.
 *
 * `PUBLIC_APP_URL` is the browser's address by definition, which is the same reason
 * `getCallbackUrl` is derived from it. AGENTS.md states the rule for `redirect_uri`;
 * this is the rule generalised, because a redirect is the same promise about the same
 * address.
 */
export function browserUrl(path = "/"): URL {
  const env = getServerEnv();

  // Only the origin is taken: `mountedPath` supplies the prefix, and `PUBLIC_APP_URL`
  // already carries it, so using the whole thing as a base would double it.
  return new URL(mountedPath(path), new URL(env.PUBLIC_APP_URL).origin);
}

/**
 * The `Path` every cookie this app writes is scoped to.
 *
 * Derived from the callback URL rather than assumed, because the two can disagree and
 * the disagreement is the bug: a callback URL without the mount prefix means the app
 * is not actually being reached under it, and scoping cookies to a prefix the browser
 * is not using would send none of them.
 *
 * Falling back to `/` is correct for a standalone deployment and expensive when it is
 * not — at `Path=/` the session is attached to every request on the hostname, and on a
 * shared origin the `Cookie` header grows with the number of apps a person has opened
 * until a proxy refuses it. See rule 3 in ATI One's internal-app contract.
 */
export function getLoginCookiePath(): string {
  const callbackPath = new URL(getCallbackUrl()).pathname;

  return APP_BASE_PATH && callbackPath.startsWith(`${APP_BASE_PATH}/`)
    ? APP_BASE_PATH
    : "/";
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

export { oidc };
