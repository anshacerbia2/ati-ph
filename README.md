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

Implemented through 2026-08-20:

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
- Controlled same-domain NotificationJob SMTP business-content pilot using frozen job content without durable job mutation
- Provider-neutral recipient acceptance classification with fail-closed partial/incomplete SMTP outcomes
- Durable accepted/rejected recipient evidence on `NotificationDeliveryAttempt`

Not enabled yet:

- Automatic SMTP execution of production/client-recipient `NotificationJob` records
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
http://localhost:3005/apps/ph-notification/app
```

In development only, opening `http://localhost:3005/` redirects to the mounted path.

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

ATI PH now has four deliberately separate email-validation levels.

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

No real email is sent by this command.

### 2. STREAM validation

Use STREAM for in-memory transport validation:

```env
EMAIL_DELIVERY_MODE=STREAM
EMAIL_SENDER_IDENTITY_CODE=PH_NOTIFICATION
EMAIL_FROM_ADDRESS=apps@atibusinessgroup.com
EMAIL_FROM_NAME=ATI Business Group
EMAIL_TRANSPORT_CODE=SAFE_STREAM
```

STREAM never opens an external SMTP connection.

Important: when the worker runs in STREAM mode, eligible database jobs can be claimed and their durable delivery state can change. Use worker STREAM execution only against a local/test database whose delivery state may safely change.

### 3. Manual SMTP connectivity test

Purpose:

```text
prove SMTP credentials + TLS + host/port + sender identity + provider acceptance
```

It does not read `NotificationJob` and it does not require the worker.

Shared SMTP configuration example:

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
EMAIL_SMTP_PASSWORD=<IT_APPROVED_APPLICATION_CREDENTIAL>
EMAIL_SMTP_CONNECTION_TIMEOUT_MS=10000
```

Connectivity-test gate:

```env
EMAIL_SMTP_TEST_ENABLED=true
EMAIL_SMTP_TEST_RECIPIENT=your.name@atibusinessgroup.com

EMAIL_SMTP_PILOT_ENABLED=false
```

Send exactly one technical test:

```cmd
npm run email:smtp:test -- --send
```

The test requires SMTP mode, an explicit enable flag, a same-domain test recipient, and the explicit `--send` flag.

A successful result proves provider acceptance, not final recipient delivery.

### 4. Controlled NotificationJob SMTP business-content pilot

Purpose:

```text
prove the real frozen ATI PH business email can traverse the SMTP engine safely
without sending to the frozen client recipient snapshot
```

The pilot:

- reads one existing `PLANNED` or `DUE` NotificationJob
- requires frozen governed `contentSnapshot` and `contentSha256`
- verifies the frozen content checksum
- preserves the frozen subject/body
- replaces TO with one configured same-domain internal recipient
- clears CC and BCC
- uses a pilot-specific deterministic idempotency key and Message-ID
- does not claim the job
- does not create a delivery attempt
- does not change NotificationJob status, attempt count, sent time, or failed time
- does not require the worker
- does not enable automatic SMTP execution

After the connectivity test is complete, use:

```env
EMAIL_SMTP_TEST_ENABLED=false
EMAIL_SMTP_TEST_RECIPIENT=your.name@atibusinessgroup.com

EMAIL_SMTP_PILOT_ENABLED=true
EMAIL_SMTP_PILOT_RECIPIENT=your.name@atibusinessgroup.com
```

`EMAIL_SMTP_TEST_RECIPIENT` may remain configured while `EMAIL_SMTP_TEST_ENABLED=false`; it is ignored by the pilot.

Run:

```cmd
npm run notification:smtp:pilot -- --job <notification-job-uuid> --send
```

Expected success:

```text
CONTROLLED SMTP PILOT
...
NOTIFICATION SMTP PILOT PASS
```

### Verified pilot baseline — 2026-08-20

The current Google Workspace direct-SMTP path was validated with:

```text
transport code: ATI_GOOGLE_DIRECT
sender: apps@atibusinessgroup.com
recipient scope: same-domain internal ATI mailbox
SMTP provider acceptance: confirmed
inbox arrival: confirmed
governed subject/body rendering: confirmed
automatic worker SMTP: still gated
```

The verified business-content pilot rendered the frozen Ticketing UK / Example Holiday Gamma / 15 March 2027 notification as expected.

The inbox also displayed an additional corporate confidentiality footer after the ATI PH governed body. The application template itself ends at `ATI Public Holiday Notification`, so that footer is downstream mail-system decoration and is not part of the frozen ATI PH content SHA-256.

Do not use a normal Google login password.

Do not paste SMTP credentials into issues, docs, commits, chat logs, or screenshots.

See `docs/LOCAL-EMAIL-TESTING.md` for the complete runbook.

## SMTP recipient outcome safety

```text
all requested recipients accepted
→ SENT

all requested recipients explicitly rejected
→ RETRYABLE failure
→ bounded by retryCeiling

partial acceptance or incomplete recipient evidence
→ OUTCOME_UNKNOWN
→ no automatic retry

generic SMTP send throws after the external send attempt begins
→ OUTCOME_UNKNOWN
→ no automatic retry
```

Provider-reported accepted and rejected recipient arrays are persisted on `NotificationDeliveryAttempt`.

The SMTP executor implementing these semantics is tested but remains intentionally disconnected from `src/worker/main.ts`.

## Production email direction

Production remains fail-closed:

```env
EMAIL_DELIVERY_MODE=DISABLED
EMAIL_SMTP_TEST_ENABLED=false
EMAIL_SMTP_PILOT_ENABLED=false
```

The direct `smtp.gmail.com` path is proven for controlled development/pilot validation. That does not make it the approved production route.

The production target remains an ATI IT-approved Google Workspace relay or another approved SMTP-compatible route without changing Public Holiday business logic.

Automatic SMTP NotificationJob execution is a separate release gate and must not be inferred from either:

```text
SMTP MANUAL TEST ACCEPTED
or
NOTIFICATION SMTP PILOT PASS
```

The worker still refuses to claim NotificationJobs in SMTP mode.

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

## Controlled NotificationJob SMTP pilot evidence

The controlled same-domain business-content pilot is now proven.

What it proves:

- a frozen approved NotificationJob can be composed and delivered through the real SMTP adapter
- the current sender identity and Google direct-SMTP transport can deliver to an internal ATI inbox
- subject, body, holiday date, and client name render from the frozen governed snapshot
- downstream corporate mail policy may append content after the application body

What it does not prove:

- production relay approval
- client-recipient production delivery
- automatic SMTP worker safety
- bounce/NDR reconciliation
- production monitoring and runbook readiness

Those remain separate release gates.
