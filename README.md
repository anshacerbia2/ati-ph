# ATI PH Notification

Standalone Next.js 16 application for governed public-holiday notification operations.

ATI One is the browser entry point and mounts ATI PH through the same-origin path:

```text
/apps/ph-notification/app
```

Canonical production browser URL:

```text
https://one.atibusinessgroup.com/apps/ph-notification/app
```

ATI PH remains independently owned and deployed as two runtime processes from one repository:

```text
Next.js web process
+
ATI PH worker process
+
PostgreSQL
```

## Current implementation status

Implemented through 2026-08-19:

- ATI One mounted application boundary
- Keycloak authentication with ATI PH-owned database sessions
- PostgreSQL application authorization and permission-gated menus
- Governed holiday XLSX import, validation, maker-checker approval, and canonical publication
- Bounded-context PostgreSQL schemas
- Calendar-region governance
- Client, service-team, contact, subscription, TO, and CC routing
- Versioned notification policy and global/client scheduling policy
- Explainable notification planning and durable plan commit
- Notification plan maker-checker approval
- Durable `NotificationJob` snapshots
- Due scheduler
- Separate worker execution
- Delivery attempts, leases, lease recovery, retry ceiling, exponential backoff, and failure classification
- Provider-neutral Email Delivery Engine
- Generic SMTP transport
- Safe in-memory STREAM transport
- Governed Public Holiday email template sourced from the supplied workbook
- Frozen rendered email content with SHA-256 integrity check
- Approval hash includes the exact frozen delivery content
- Explicit gated manual SMTP connectivity test

Not enabled yet:

- Automatic SMTP execution of production `NotificationJob` records
- Automatic provider failover
- Provider-specific API adapters
- Bounce/NDR ingestion
- Production SMTP relay activation
- Production output attachment contract where Operations has not supplied one

SMTP configuration does not unlock automatic notification delivery. The worker currently claims email jobs only when `EMAIL_DELIVERY_MODE=STREAM`.

## Architecture boundary

```text
Public Holiday business rules
→ Notification planning
→ frozen NotificationJob
→ scheduler
→ worker
→ Email Delivery Engine
→ STREAM or configured SMTP transport
```

Business rules do not know Google, Brevo, SMTP2GO, or another transport provider.

Sender identity is also separate from transport routing:

```text
PH_NOTIFICATION
→ apps@atibusinessgroup.com
→ transport code
→ transport adapter
```

See:

- `architecture.md`
- `plan.md`
- `PROPOSAL.md`
- `docs/EMAIL-DELIVERY-PLATFORM.md`
- `docs/LOCAL-EMAIL-TESTING.md`
- `docs/ACCESS-CONTROL.md`
- `docs/DATABASE-SCHEMA-BOUNDARIES.md`
- `docs/GOVERNED-IMPORT-CONTRACT.md`

## Authentication boundary

- Keycloak proves identity
- ATI PH creates its own database-backed `ati_ph_session`
- ATI PH does not consume ATI One cookies or application authorization state
- Keycloak is not the source of ATI PH business roles
- ATI PH roles and permissions live in PostgreSQL
- Logout currently ends the ATI PH local session only
- The shared ATI One Keycloak client remains a temporary internal-app decision

The future dedicated-client and single-logout direction is documented in `docs/FUTURE-SINGLE-LOGOUT.md`.

## Local setup

Requirements:

- Node.js 20.19+; Node.js 22 LTS or Node.js 24 are suitable
- PostgreSQL
- Local `.env`
- Keycloak/database credentials

Setup:

```cmd
copy .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
```

Run the web process:

```cmd
npm run dev
```

Run the worker separately:

```cmd
npm run worker
```

Open:

```text
http://localhost:3000/apps/ph-notification/app
```

In development only, opening `http://localhost:3000/` redirects to the mounted path.

## Worker responsibility

The worker is not optional in the production topology.

It owns background execution such as:

- expired application-session cleanup
- `PLANNED -> DUE` promotion
- expired delivery-lease recovery
- `RETRY_WAIT -> DUE` promotion
- STREAM delivery execution when explicitly configured

Web requests do not run durable scheduling or delivery work as unawaited background tasks.

## Database

ATI PH uses one PostgreSQL database with bounded-context schemas:

```text
access
approval
governance
holiday
import
notification
routing
```

`public` remains available for Prisma migration bookkeeping.

See `docs/DATABASE-SCHEMA-BOUNDARIES.md`.

## Local role assignment

A user must sign in through Keycloak at least once before assigning an ATI PH role.

Example:

```cmd
npm run authz:grant -- --email user@example.com --role OPERATOR
```

Supported roles:

```text
ADMINISTRATOR
OPERATOR
APPROVER
AUDITOR
```

A user can hold multiple roles, but maker-checker identity separation still applies.

Current notification permissions include:

```text
notification_policy.read
notification_policy.manage
notification_plan.read
notification_plan.commit
notification_plan.approve
```

See `docs/ACCESS-CONTROL.md`.

## Governed holiday import

The server is authoritative for XLSX validation.

Current contract:

```text
XLSX upload
→ immutable raw evidence
→ authoritative server validation
→ staging
→ maker-checker
→ canonical holiday occurrence
→ notification planning
```

Important duplicate controls:

- `fileSha256` blocks byte-identical source evidence
- `businessContentSha256` blocks the same canonical holiday business dataset even when workbook bytes differ
- source row ID, remarks, formatting, unrelated sheets, legacy `Day`, and legacy `Tag` do not create a new business dataset

Official governed import files:

- `docs/ATI-PH-Import-Template-Governed.xlsx`
- `docs/ATI-PH-Example-Import-Governed.xlsx`

See `docs/GOVERNED-IMPORT-CONTRACT.md`.

## Notification planning and approval

Routing answers **who** receives a notification.

Scheduling policy answers **when** it should be sent.

Plan commit freezes the execution contract into durable `NotificationJob` rows, including:

- recipient snapshot
- rule snapshot
- schedule snapshot
- rendered governed email content
- email content SHA-256
- automatic-send flag
- retry ceiling

When approval is required:

```text
commit
→ WAITING_APPROVAL
→ maker-checker approval
→ PLANNED
```

Rejection transitions waiting jobs to `CANCELLED`.

Approval hashes include the exact frozen email content so a later template change cannot silently alter an already approved notification.

## Governed Public Holiday email content

The current default email contract is grounded in the supplied workbook `Email Template` sheet, active `All / Default` row.

Current subject template:

```text
ATI - [Client Name] Public Holiday Reminder - [PH Name] - [Date Period]
```

Rendered content is frozen at plan commit time.

The delivery worker does not rerender from a later mutable template version.

Existing committed jobs created before the frozen-content migration are intentionally not backfilled.

The current active default workbook template does not define an attachment contract, so no attachment is invented by the application.

## Email Delivery Engine

The reusable email engine separates:

```text
EmailMessage
→ SenderIdentity
→ Transport route
→ EmailTransport
```

Current transports:

- `STREAM`: renders a complete RFC822 message in memory and sends nothing externally
- `SMTP`: generic Nodemailer SMTP transport

Current safety controls:

- delivery defaults to disabled
- deterministic Message-ID from the business idempotency key
- no implicit provider fallback
- file and URL attachment access disabled
- credentials come from environment secrets
- unknown delivery outcome is never automatically retried
- lease recovery is auto-retryable only when the durable attempt explicitly records `leaseRetrySafe=true`
- production NotificationJob SMTP execution remains gated

See `docs/EMAIL-DELIVERY-PLATFORM.md`.

## Email tests

### 1. Full automated verification

```cmd
npm run verify
```

This runs:

```text
typecheck
unit/contract tests
lint
production build
```

### 2. STREAM validation

Safe transport validation uses:

```env
EMAIL_DELIVERY_MODE=STREAM
EMAIL_SENDER_IDENTITY_CODE=PH_NOTIFICATION
EMAIL_FROM_ADDRESS=apps@atibusinessgroup.com
EMAIL_FROM_NAME=ATI Business Group
EMAIL_TRANSPORT_CODE=SAFE_STREAM
```

`STREAM` never opens an external SMTP connection.

Important: when the worker is running in STREAM mode, eligible real database notification jobs can be claimed and transitioned as delivery work even though the message is only generated in memory. Use STREAM worker execution only against a local/test database whose delivery state may safely change.

For normal code-level validation, prefer:

```cmd
npm run verify
```

### 3. Gated manual SMTP connectivity test

This is the only current supported way to send a real SMTP test email from the repository.

It is intentionally separate from `NotificationJob` execution and does not access the application database.

Example local Google Workspace direct-SMTP configuration:

```env
EMAIL_DELIVERY_MODE=SMTP

EMAIL_SENDER_IDENTITY_CODE=PH_NOTIFICATION
EMAIL_FROM_ADDRESS=apps@atibusinessgroup.com
EMAIL_FROM_NAME=ATI Business Group
EMAIL_TRANSPORT_CODE=ATI_GOOGLE_DIRECT

EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_REQUIRE_TLS=true

EMAIL_SMTP_USER=apps@atibusinessgroup.com
EMAIL_SMTP_PASSWORD=<APP_PASSWORD_OR_OTHER_IT_APPROVED_APPLICATION_CREDENTIAL>

EMAIL_SMTP_CONNECTION_TIMEOUT_MS=10000

EMAIL_SMTP_TEST_ENABLED=true
EMAIL_SMTP_TEST_RECIPIENT=<YOUR_ATI_EMAIL>
```

Then explicitly send exactly one technical test message:

```cmd
npm run email:smtp:test -- --send
```

The command refuses to send unless:

- delivery mode is `SMTP`
- `EMAIL_SMTP_TEST_ENABLED=true`
- `EMAIL_SMTP_TEST_RECIPIENT` is configured
- the explicit `--send` flag is present
- test-recipient domain matches `EMAIL_FROM_ADDRESS`

Do not use a normal Google login password.

Do not paste SMTP credentials into issues, docs, commits, chat logs, or screenshots.

For full instructions and Google Workspace notes, see `docs/LOCAL-EMAIL-TESTING.md`.

## Production email direction

Production remains fail-closed:

```env
EMAIL_DELIVERY_MODE=DISABLED
EMAIL_SMTP_TEST_ENABLED=false
```

The production target can use Google Workspace SMTP relay or another approved SMTP-compatible provider without changing Public Holiday business logic.

Automatic SMTP NotificationJob execution is a separate release gate and must not be inferred from a successful manual SMTP connectivity test.

## Validation commands

Fast verification:

```cmd
npm run verify:fast
```

Full verification:

```cmd
npm run verify
```

Database schema drift:

```cmd
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
```

Working-tree whitespace validation:

```cmd
git diff --check
```

## Environment files

- `.env.example` is the local-development reference
- `.env.production.example` is the fail-closed production reference
- `.env` is local-only and ignored by Git
- never commit actual database, Keycloak, SMTP, proxy, or session secrets

## Browser extension hydration warnings

Attributes such as `bis_skin_checked`, `bis_register`, and `processed_<uuid>` can be injected by browser extensions before React hydrates.

Disable the extension for localhost when validating hydration. These attributes are not emitted by ATI PH.

## Controlled NotificationJob SMTP pilot

After the generic SMTP connectivity test succeeds, the next release gate is a controlled business-content pilot.

The pilot:

- reads one existing `NotificationJob`
- requires the job to be `PLANNED` or `DUE`
- uses the exact frozen governed email content and SHA-256 snapshot
- overrides TO to one configured same-domain internal recipient
- clears CC/BCC
- uses a pilot-specific deterministic Message-ID/idempotency key
- does not claim the job
- does not create a delivery attempt
- does not mutate the durable job state
- does not enable worker SMTP execution

Example:

```env
EMAIL_DELIVERY_MODE=SMTP
EMAIL_SMTP_PILOT_ENABLED=true
EMAIL_SMTP_PILOT_RECIPIENT=your.name@atibusinessgroup.com
```

Then:

```cmd
npm run notification:smtp:pilot -- --job <notification-job-uuid> --send
```

The command fails closed unless the pilot recipient uses the same domain as `EMAIL_FROM_ADDRESS`.

Automatic SMTP execution by the worker remains a separate production release gate.
