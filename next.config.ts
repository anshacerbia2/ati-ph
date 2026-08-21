import type { NextConfig } from "next";

// The one declaration of the default mount path. Imported rather than repeated: the
// literal used to live here, in `src/config/app.ts` and in `src/auth/oidc.ts`, and
// nothing kept the three in step.
import { APP_BASE_PATH } from "./src/config/app";

const basePath = APP_BASE_PATH;

/*
 * `DEV_APP_ORIGIN` had `http://localhost:3000` as a default here, which made this file
 * a second place where a deployment fact was written down. It is required by every
 * profile now; the fallback below exists only so `next build` in a bare CI checkout
 * does not need a value for a redirect that development alone uses.
 */
const devOrigin = new URL(
  process.env.DEV_APP_ORIGIN ?? "http://localhost:3000",
).origin;
const oidcCallbackUrl = process.env.OIDC_CALLBACK_URL;

const nextConfig: NextConfig = {
  basePath,
  output: "standalone",
  poweredByHeader: false,
  /*
   * The portal's origin, so the dev server will answer it.
   *
   * Mounted in ATI One, the browser asks for this app's dev assets from the *portal's*
   * address while this server was initialised on its own. Next blocks cross-origin
   * requests to dev-only assets and endpoints by default, which is right — and it means
   * the framed app is exactly the case that has to be allowed explicitly.
   *
   * Only the host is listed; `output: "standalone"` production builds ignore this
   * entirely, so it cannot widen anything that ships.
   */
  allowedDevOrigins: [new URL(devOrigin).host],
  async redirects() {
    if (process.env.NODE_ENV !== "development" || !basePath) {
      return [];
    }

    const developmentRedirects: Array<{
      source: string;
      destination: string;
      basePath: false;
      permanent: boolean;
    }> = [
      {
        source: "/",
        destination: `${devOrigin}${basePath}`,
        basePath: false,
        permanent: false,
      },
    ];

    if (oidcCallbackUrl) {
      const callbackUrl = new URL(oidcCallbackUrl);
      const mountedCallbackPath = `${basePath}/api/auth/callback/keycloak`;
      if (
        callbackUrl.origin === devOrigin &&
        callbackUrl.pathname !== mountedCallbackPath
      ) {
        developmentRedirects.push({
          source: callbackUrl.pathname,
          destination: `${devOrigin}${mountedCallbackPath}`,
          basePath: false,
          permanent: false,
        });
      }
    }

    return developmentRedirects;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
