import "server-only";

import * as oidc from "openid-client";

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

export function getLoginCookiePath(): string {
  const callbackPath = new URL(getCallbackUrl()).pathname;
  const configuredBasePath =
    process.env.NEXT_PUBLIC_APP_BASE_PATH ?? "/apps/ph-notification/app";

  return configuredBasePath && callbackPath.startsWith(`${configuredBasePath}/`)
    ? configuredBasePath
    : "/";
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

export { oidc };
