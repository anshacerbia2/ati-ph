export const APP_BASE_PATH =
  process.env.NEXT_PUBLIC_APP_BASE_PATH ?? "/apps/ph-notification/app";

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
