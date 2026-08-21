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

Software-complete baseline as of 2026-08-20:

- ATI One mounted application boundary
- Keycloak authentication with ATI PH-owned database sessions
- PostgreSQL-owned application authorization and permission-gated menus
- Governed holiday XLSX import, validation, maker-checker approval, and canonical publication
- Bounded-context PostgreSQL schemas
- Calendar-region governance
- Client, service-team, contact, subscription, TO, and CC routing
- Versioned notification and schedule policies
- Explainable notification planning and durable frozen NotificationJob commit
- Notification maker-checker approval
- Trusted planning automation with shadow-only default
- Automatic DUE scheduling
- Holiday correction/replanning with approval forcing for corrected occurrences
- Provider-neutral Email Delivery Engine
- STREAM and generic SMTP transports
- Durable delivery attempts, leases, bounded retry, lease recovery, and failure classification
- Exact recipient outcome evidence and fail-closed partial/incomplete SMTP handling
- OUTCOME_UNKNOWN reconciliation with mark-delivered, manual retry, and close-failed actions
- Automatic SMTP worker execution behind explicit enablement and kill-switch controls
- Production-only SMTP release approval gate
- Scheduler-lag, zero-recipient, planning-blocked, and delivery-failure alerts
- Persistent worker heartbeat and operational dashboard
- Notification audit visibility
- Liveness, database health, and full operational readiness endpoints
- Controlled resolved-alert retention
- Production readiness CLI and acceptance checklist

Production activation remains deliberately separate from software completeness

Not production-enabled by default:

- automatic production/client-recipient SMTP
- trusted automatic plan commit
- resolved-alert retention
- automatic provider fallback
- provider-specific HTTP API adapters
- bounce/NDR ingestion
- production output attachment where Operations has not approved a contract

SMTP worker execution is wired. It claims SMTP jobs only when the release controls permit it. In production this requires explicit automatic enablement, an inactive kill switch, and explicit production release approval.

See `docs/PRODUCTION-DEPLOYMENT-AI-AGENT.md` for the production deployment contract

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
- `docs/PRODUCTION-DEPLOYMENT-AI-AGENT.md`
- `docs/PRODUCTION-READINESS.md`
- `docs/SMTP-AUTOMATIC-DELIVERY-RUNBOOK.md`
- `docs/TRUSTED-AUTOMATION-RUNBOOK.md`

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
copy .env.local.example .env
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
```

`.env.local.example` is one of three complete profiles — local, test and production.
Each writes out every variable ATI PH reads, including the ones whose value equals the
code default, so the file alone tells you what the process will do. `.env.example` holds
no variables; it is an index naming the three. See
[`docs/ENVIRONMENT-PROFILES.md`](docs/ENVIRONMENT-PROFILES.md).

Run the web process:

```cmd
npm run dev
```

Run the worker separately:

```cmd
npm run worker
```

**The worker is off in the local profile.** `NOTIFICATION_WORKER_ENABLED=false` makes
that command print why and exit without starting. That is deliberate: a worker running
against a database you are editing claims jobs, promotes schedules and mutates durable
delivery state without being asked. Set it to `true` for a specific test, then set it
back.

Open:

```text
http://localhost:3000
```

That is the local profile's address — no mount prefix, because a standalone run is
served at the origin root. Behind ATI One's proxy the app answers on
`/apps/ph-notification/app` instead, which is what `NEXT_PUBLIC_APP_BASE_PATH` sets.

In development only, opening `http://localhost:3005/` redirects to the mounted path.

## Worker responsibility

The worker is not optional in the production topology

It owns:

- expired application-session cleanup
- trusted planning scan and optional automatic plan commit
- `PLANNED -> DUE` promotion
- expired delivery-lease recovery
- `RETRY_WAIT -> DUE` promotion
- STREAM delivery when configured
- SMTP delivery only when explicit release controls permit it
- scheduler-lag and delivery-failure alert synchronization
- durable worker heartbeat
- optional resolved-alert retention

Web requests do not execute durable scheduling or email delivery as unawaited background work

Trusted planning automation and SMTP delivery are independent release controls

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

partial acceptance or incomplete/inconsistent recipient evidence
→ OUTCOME_UNKNOWN
→ no automatic retry

generic SMTP send throws after the external send attempt begins
→ OUTCOME_UNKNOWN
→ no automatic retry
```

Accepted/rejected recipient evidence is persisted on `NotificationDeliveryAttempt`

OUTCOME_UNKNOWN attempts are surfaced in the delivery reconciliation queue and require an authorized explicit resolution

A superseded holiday can still be reconciled as delivered or failed, but retry is blocked after correction

## Production email direction

Production deployment is fail-closed by default

```env
EMAIL_DELIVERY_MODE=DISABLED
EMAIL_SMTP_TEST_ENABLED=false
EMAIL_SMTP_PILOT_ENABLED=false
EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED=false
EMAIL_DELIVERY_KILL_SWITCH=true
EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED=false
```

The direct `smtp.gmail.com` path is proven only for controlled development/pilot validation

The production route remains ATI IT-owned configuration

Automatic production SMTP requires all runtime release controls to agree

```env
EMAIL_DELIVERY_MODE=SMTP
EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED=true
EMAIL_DELIVERY_KILL_SWITCH=false
EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED=true
```

The final production release flag is mandatory when `NODE_ENV=production`

No automatic provider fallback exists

See:

- `docs/PRODUCTION-DEPLOYMENT-AI-AGENT.md`
- `docs/PRODUCTION-READINESS.md`
- `docs/SMTP-AUTOMATIC-DELIVERY-RUNBOOK.md`

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

**`.env` is the source of truth.** Reading it tells you what the process will do — no
variable is read that the file does not declare, and no behaviour hides in a code
default the file leaves out.

| File | Profile | Email | Worker | Can email a client |
| --- | --- | --- | --- | --- |
| `.env.local.example` | local development | manual connectivity test | **disabled** | no |
| `.env.test.example` | shared test | controlled pilot | enabled, delivers nothing | no |
| `.env.production.example` | production | **automatic** | enabled | **yes** |

- `.env.example` holds no variables. It is an index that names the three above.
- Copy one whole profile. Do not assemble one from parts — that is the problem these
  replaced.
- `src/config/server-env.ts` declares and validates every variable, and refuses
  combinations that cannot mean what they say: automatic delivery armed against a
  non-SMTP transport, the test and pilot commands both enabled, delivery armed while the
  worker is disabled. Those fail at boot with the contradiction named.
- Every example profile is parsed against that schema by `npm run verify:fast`, so an
  example that drifts from the code fails in CI rather than on somebody's machine.
- `.env` is local-only and ignored by Git.
- Never commit actual database, Keycloak, SMTP, proxy, or session secrets.

[`docs/ENVIRONMENT-PROFILES.md`](docs/ENVIRONMENT-PROFILES.md) is the reference: what
each profile may do, which variable decides it, and what has to be true before the next
profile is used.

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
- production automatic SMTP activation approval
- bounce/NDR reconciliation
- production monitoring and runbook readiness

Those remain separate release gates.
