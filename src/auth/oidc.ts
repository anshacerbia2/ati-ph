import "server-only";

import * as oidc from "openid-client";

import { APP_BASE_PATH } from "@/config/app";
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
