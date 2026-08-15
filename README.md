# ATI PH Notification

Standalone Next.js 16 application for public-holiday notification operations.
ATI One is the entry point and renders the app through a same-origin
iframe/reverse-proxy path at `/apps/ph-notification/app`.

The canonical production browser URL is
`https://one.atibusinessgroup.com/apps/ph-notification/app`. The path-only form
is used in ATI One's iframe/proxy configuration because the browser resolves it
against the ATI One origin.

The operational dashboard intentionally mirrors the PH Notification mockup in
ATI One. Its colors, typography, spacing, radii, cards, buttons, badges, and tags
are local copies of the ATI design-system contract so this app can deploy
independently without importing runtime code from `ai-portal`.

## Authentication boundary

- Keycloak proves identity using the same client ID currently used by ATI One.
- ATI PH creates its own database-backed `ati_ph_session` cookie.
- ATI PH does not consume ATI One cookies or tokens.
- ATI PH refreshes only when its encrypted access token enters the configured
  expiry skew; concurrent refreshes are coalesced and a refused refresh revokes
  the local database session.
- Iframe navigation attempts silent SSO with `prompt=none`; direct/top-level
  navigation uses normal OIDC login, and the fallback button always requests an
  interactive login.
- Logout ends only the ATI PH app session so it does not unexpectedly sign the
  user out of ATI One.
- Production can reject direct-origin traffic using the `x-ati-one-proxy` proof
  header.

The shared Keycloak client is an explicit temporary internal-app decision. Split
it before ATI PH receives an independently reachable origin or requires a
different redirect, CSP, or token policy.

## Local setup

1. Use Node.js 20.19+ (Node.js 22 LTS or 24 is recommended).
2. Copy `.env.example` to `.env` and provide the Keycloak/database secrets.
3. Run `npm run db:generate` and `npm run db:migrate`.
4. Run `npm run dev` for the web app and `npm run worker` separately.

Open `http://localhost:3000/apps/ph-notification/app`. In development only,
opening `http://localhost:3000/` redirects to that mounted path. Set
`DEV_APP_ORIGIN` if the dev server uses another origin or port.

Production must use the ATI One public origin from `.env.production.example`.
Do not replace the local `.env` URL with the production URL while testing the
standalone dev server, because the OIDC callback must return to the same public
origin that initiated login.

The local environment uses `http://localhost:3000/api/auth/callback/keycloak`,
which is already registered for the shared ATI One Keycloak client. ATI PH
redirects that development-only callback to its mounted handler. Run
ATI PH by itself on port 3000; ATI One does not need to run for this standalone
flow. Full iframe testing is a separate topology: ATI One owns port 3000, ATI PH
runs on another upstream port, and Keycloak must allow the complete mounted
callback URI.

Keycloak must allow this exact callback URL:

`{PUBLIC_APP_URL}/api/auth/callback/keycloak`

For production, that resolves to
`https://one.atibusinessgroup.com/apps/ph-notification/app/api/auth/callback/keycloak`.

## Validation

```text
npm run lint
npm run typecheck
npm test
npm run build
```

See `architecture.md` and `plan.md` for the implementation boundaries and
delivery phases.

The current shared-client logout limitation and the target dedicated-client,
back-channel single-logout design are documented in
`docs/FUTURE-SINGLE-LOGOUT.md`.

## Browser extension hydration warnings

Attributes such as `bis_skin_checked`, `bis_register`, and `processed_<uuid>`
are injected before React hydrates by security/password-manager browser
extensions. Root boundaries suppress the common noise, but an extension can
still modify nested nodes. Disable the extension for localhost when checking
hydration; these attributes are not emitted by ATI PH.
