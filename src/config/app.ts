/**
 * Where ATI PH is mounted when the environment does not say.
 *
 * This literal existed in three files — here, `next.config.ts` and
 * `getLoginCookiePath` in `src/auth/oidc.ts` — and the copies were free to disagree.
 * They did: with a callback URL that omitted the prefix, the cookie path silently fell
 * back to `/` — and at `Path=/` the session is attached to every request on the shared
 * hostname, so the `Cookie` header grows with the number of apps a person has opened
 * until a proxy refuses it. One value, imported by everything that needs it.
 *
 * Empty string is a legitimate setting and means "served at the origin root", which is
 * what a standalone deployment outside ATI One wants. `??` rather than `||` so an
 * explicit empty value survives instead of being replaced by this default.
 */
export const DEFAULT_APP_BASE_PATH = "/apps/ph-notification/app";

export const APP_BASE_PATH =
  process.env.NEXT_PUBLIC_APP_BASE_PATH ?? DEFAULT_APP_BASE_PATH;

export const SESSION_COOKIE_NAME = "ati_ph_session";
export const LOGIN_COOKIE_NAME = "ati_ph_login";
export const PROXY_PROOF_HEADER = "x-ati-one-proxy";

export function mountedPath(path = "/"): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!APP_BASE_PATH) {
    return normalizedPath;
  }

  return normalizedPath === "/"
    ? `${APP_BASE_PATH}/`
    : `${APP_BASE_PATH}${normalizedPath}`;
}

export function stripBasePath(pathname: string): string {
  if (!APP_BASE_PATH || !pathname.startsWith(APP_BASE_PATH)) {
    return pathname || "/";
  }

  return pathname.slice(APP_BASE_PATH.length) || "/";
}

export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  try {
    const parsed = new URL(value, "http://ati-ph.local");
    if (parsed.origin !== "http://ati-ph.local") {
      return "/";
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}
