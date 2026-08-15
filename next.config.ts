import type { NextConfig } from "next";

const basePath =
  process.env.NEXT_PUBLIC_APP_BASE_PATH ?? "/apps/ph-notification/app";
const devOrigin = new URL(
  process.env.DEV_APP_ORIGIN ?? "http://localhost:3000",
).origin;
const oidcCallbackUrl = process.env.OIDC_CALLBACK_URL;

const nextConfig: NextConfig = {
  basePath,
  output: "standalone",
  poweredByHeader: false,
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
