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

## Local role assignment

ATI PH application roles are stored locally in PostgreSQL. A user must sign in through Keycloak at least once before a local role can be attached.

Grant one role:

```bash
npm run authz:grant -- --email user@example.com --role OPERATOR
```

Grant another role to the same user by running the command again with a different role:

```bash
npm run authz:grant -- --email user@example.com --role APPROVER
```

Supported system roles are `ADMINISTRATOR`, `OPERATOR`, `APPROVER`, and `AUDITOR`. One user may hold multiple roles. Maker-checker still requires the approval requester and approver to be different users even when one account holds both OPERATOR and APPROVER.

## Database schema boundaries

ATI PH uses one PostgreSQL database with explicit bounded-context schemas for
`access`, `governance`, `import`, `approval`, `holiday`, `routing`, and
`notification`. Prisma relations may cross those schemas inside the modular
monolith, while raw SQL must use schema-qualified application table names.

See `docs/DATABASE-SCHEMA-BOUNDARIES.md` for the mapping and invariants.

## Validation

```text
npm run lint
npm run typecheck
npm test
npm run build
```

## Governed holiday import

The dashboard accepts `.xlsx` uploads from users with the `OPERATOR` or
`ADMINISTRATOR` application role. The current Phase 1 flow previews
`Holiday_Master` in the browser for UX only, submits only the untouched XLSX,
parses and validates it authoritatively once in the server API, stores accepted
raw evidence immutably, persists authoritative rows and issues, emits
`ImportBatchValidated` transactionally, supports maker-checker approval, and
publishes canonical holiday occurrences. Email delivery remains outside Phase 1.

Duplicate identity is deliberately split into two layers:

- `fileSha256` identifies byte-identical XLSX evidence and hard-blocks
  `EXACT_FILE_DUPLICATE`
- `businessContentSha256` identifies canonical authoritative `Holiday_Master`
  business content and hard-blocks `SAME_HOLIDAY_DATA`, even when workbook
  metadata, filename, formatting, row order, or unrelated sheets differ
- Source row ID, source reference, remarks, legacy `Day`/`Tag`, and sheets other
  than `Holiday_Master` do not create a new holiday business dataset
- The normal import flow has no exact-duplicate or semantic-duplicate confirmation override

Development artifacts are written under `ARTIFACT_STORAGE_DIR` (default
`./storage/artifacts`) and are ignored by Git. Production must use a durable,
encrypted mounted path or a replacement storage adapter. Set
`IMPORT_MAX_FILE_SIZE_BYTES` to the approved upload limit.

Phase 1 database changes are represented by the committed Prisma migrations
under `prisma/migrations`, including authoritative server validation and
`businessContentSha256`. Existing environments must run `npm run db:deploy`;
use `npm run db:migrate` only while developing new migrations.

The accepted workbook contract and current limitations are documented in
`docs/GOVERNED-IMPORT-CONTRACT.md`.

The official governed workbook files are:

- `docs/ATI-PH-Import-Template-Governed.xlsx`
- `docs/ATI-PH-Example-Import-Governed.xlsx`

See `PROPOSAL.md`, `architecture.md`, and `plan.md` for the client-facing solution,
implementation boundaries, and delivery phases.

Related contracts:

- `docs/GOVERNED-IMPORT-CONTRACT.md`
- `docs/ACCESS-CONTROL.md`
- `docs/EMAIL-DELIVERY-PLATFORM.md`

The current shared-client logout limitation and the target dedicated-client,
back-channel single-logout design are documented in
`docs/FUTURE-SINGLE-LOGOUT.md`.

## Email delivery direction

Email delivery is outside the current Phase 1 implementation

The planned Phase 3 design is provider-neutral:

- Generic SMTP is the first transport adapter
- Provider records and ordered routes are runtime configuration
- Provider adapter implementations remain trusted code
- SMTP-compatible providers can be switched without changing Public Holiday business logic when they use the same implemented SMTP adapter
- Provider-specific API adapters remain optional
- Microsoft Graph is not a required dependency
- No paid provider is mandatory in the architecture
- Automatic provider fallback is forbidden after provider acceptance or an unknown delivery outcome
- The delivery capability starts as a reusable module and becomes a shared Email Delivery Platform only after a second production consumer validates the contract

See `docs/EMAIL-DELIVERY-PLATFORM.md` for the detailed design

## Browser extension hydration warnings

Attributes such as `bis_skin_checked`, `bis_register`, and `processed_<uuid>`
are injected before React hydrates by security/password-manager browser
extensions. Root boundaries suppress the common noise, but an extension can
still modify nested nodes. Disable the extension for localhost when checking
hydration; these attributes are not emitted by ATI PH.
