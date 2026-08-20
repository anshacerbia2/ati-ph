# Email Delivery Engine and Platform Candidate

| Metadata | Value |
| --- | --- |
| Status | Stage 1 reusable engine implemented through gated automatic SMTP execution, reconciliation, and production readiness; production activation remains gated |
| Version | 0.4.0 |
| Date | 2026-08-20 |
| First consumer | Public Holiday Notification Workflow |
| Current implementation | Provider-neutral engine, STREAM, generic SMTP, durable attempt/retry contract, manual SMTP connectivity test, controlled frozen-NotificationJob SMTP pilot |
| Initial production provider direction | Approved SMTP-compatible route; Google Workspace relay is the current ATI candidate |
| Platform extraction | Not justified yet |

## 1. Purpose

Define the provider-neutral email delivery capability used by ATI PH without coupling Public Holiday business logic to Google, Brevo, SMTP2GO, Microsoft Graph, or another provider.

The capability is currently a reusable module inside the `ati-ph` modular monolith.

It becomes a shared platform only after a second production consumer validates the contract and shared ownership is justified.

## 2. Current state

Implemented:

- provider-neutral `EmailMessage`
- sender identity separate from transport
- environment-backed route resolver
- STREAM transport
- generic SMTP transport
- deterministic Message-ID and idempotency header
- Nodemailer file/URL access disabled
- durable NotificationJob delivery attempts
- provider/provider-message ID evidence
- accepted/rejected recipient evidence
- claim leases
- retry ceiling and exponential backoff
- RETRYABLE, TERMINAL, and OUTCOME_UNKNOWN
- expired-lease recovery
- SMTP claims marked non-retry-safe
- fail-closed partial/incomplete SMTP outcomes
- frozen governed Public Holiday content
- content SHA-256 verification
- approval hash over exact frozen content
- gated manual SMTP connectivity test
- controlled same-domain frozen-NotificationJob SMTP pilot
- automatic SMTP worker execution behind explicit enablement and kill switch
- production-only SMTP release approval
- authorized OUTCOME_UNKNOWN reconciliation
- operational delivery failure alerting
- production readiness reporting
- no automatic provider fallback

Still gated or future:

- production/client-recipient SMTP activation
- database-backed dynamic provider registry
- provider HTTP API adapters
- bounce/NDR ingestion when required
- formal shared Email Delivery Platform extraction

## 3. Ownership boundary

Public Holiday owns:

- holiday eligibility
- client/service-team subscription matching
- holiday-specific routing
- notification policy selection
- planning and business approval requirements

Notification owns:

- governed template selection
- placeholder rendering
- frozen subject/body content
- frozen recipient snapshot
- durable notification job
- schedule snapshot
- approval hash integration

Scheduling and Execution owns:

- `PLANNED -> DUE`
- due-work claim
- processing lease
- retry timing
- expired-lease recovery
- terminal failure state

Email Delivery owns:

- sender identity
- transport route
- SMTP/STREAM adapter
- provider acceptance result
- transport-level message ID
- transport security controls

Public Holiday business code must not read provider credentials or contain provider-specific send logic.

## 4. Current logical architecture

```text
Holiday occurrence
→ client/subscription matching
→ schedule resolution
→ NotificationJob commit
→ frozen recipients/rules/content
→ maker-checker when required
→ PLANNED
→ scheduler
→ DUE
→ worker claim + delivery attempt
→ Email Delivery Engine
→ STREAM or SMTP
```

STREAM automatic execution is available for safe local/test transport validation

SMTP automatic execution is implemented but claims jobs only when explicit release controls permit it

```text
EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED=true
EMAIL_DELIVERY_KILL_SWITCH=false

production
→ also EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED=true
```

SMTP claims use `leaseRetrySafe=false` so an expired external delivery lease becomes OUTCOME_UNKNOWN rather than a blind retry

Manual SMTP connectivity and controlled NotificationJob pilot remain separate operator-run validation tools that do not unlock worker SMTP

## 5. Durable NotificationJob contract

Current job data includes:

- business idempotency key
- holiday occurrence
- client subscription
- notification policy version
- global/client schedule source
- planned date/time/timezone
- recipient snapshot
- rule snapshot
- governed rendered content snapshot
- content SHA-256
- automatic-send flag
- retry ceiling
- attempt count
- retry timestamp
- sent/failed timestamps

Existing jobs created before the governed-content migration are intentionally not backfilled.

They must not silently inherit a later email template.

## 6. Governed email content

The active default Public Holiday template is grounded in the supplied workbook `Email Template` sheet, `All / Default / Active`.

Subject:

```text
ATI - [Client Name] Public Holiday Reminder - [PH Name] - [Date Period]
```

The rendered subject and HTML are frozen at plan commit.

Approval includes the exact frozen content in its deterministic content hash.

The worker validates the frozen content checksum before composition.

The current active default workbook row does not define an attachment contract, so the implementation does not invent one.

## 7. Generic SMTP adapter

Current configuration:

```text
host
port
secure
requireTLS
username/password optional pair
connection timeout
```

Security controls:

- TLS mode explicit
- `disableFileAccess=true`
- `disableUrlAccess=true`
- no provider-specific code in Public Holiday
- credentials from environment secrets
- no automatic provider fallback

SMTP-compatible providers can reuse this adapter.

## 8. STREAM adapter

STREAM is an in-memory transport used for safe technical validation.

It does not open a network connection.

Current worker behavior:

```text
EMAIL_DELIVERY_MODE=STREAM
→ worker may claim eligible DUE jobs
→ message composed from frozen content
→ STREAM transport accepts in memory
→ durable attempt completion executes
```

Because durable state changes, STREAM worker execution must use an appropriate local/test database.

## 9. Retry and lease recovery

Current failure classes:

```text
RETRYABLE
TERMINAL
OUTCOME_UNKNOWN
```

`retryCeiling` means number of retries after the first attempt.

Example:

```text
retryCeiling = 3
attempt 1 fails
→ retry 1

attempt 2 fails
→ retry 2

attempt 3 fails
→ retry 3

attempt 4 fails
→ terminal failure
```

Backoff starts at 60 seconds and grows exponentially with a 3600-second cap.

Missing retry ceiling fails safe to zero automatic retries.

`TERMINAL` and `OUTCOME_UNKNOWN` never auto-retry.

Expired claims are auto-retryable only when the durable attempt is marked `leaseRetrySafe=true`.

SMTP worker claims currently use `leaseRetrySafe=false`. This must remain false unless transport/provider idempotency proves duplicate delivery cannot occur.

## 10. Real SMTP validation slices

### 10.1 Manual SMTP connectivity

Command:

```cmd
npm run email:smtp:test -- --send
```

Safety requirements:

- SMTP mode
- explicit `EMAIL_SMTP_TEST_ENABLED=true`
- explicit same-domain test recipient
- explicit `--send`

The script does not access Prisma or NotificationJob.

A successful result validates SMTP connectivity and provider acceptance only.

### 10.2 Controlled NotificationJob SMTP pilot

Command:

```cmd
npm run notification:smtp:pilot -- --job <notification-job-uuid> --send
```

Safety requirements:

- SMTP mode
- explicit `EMAIL_SMTP_PILOT_ENABLED=true`
- explicit same-domain pilot recipient
- real `PLANNED` or `DUE` NotificationJob UUID
- frozen content snapshot and SHA-256
- explicit `--send`

The pilot:

- reads the durable job as evidence
- verifies frozen content integrity
- preserves frozen subject/body
- overrides delivery to the internal pilot recipient
- clears CC/BCC
- does not claim the job
- does not create a delivery attempt
- does not mutate the job
- does not enable worker SMTP execution

### 10.3 Verified baseline — 2026-08-20

The current `ATI_GOOGLE_DIRECT` route has proven:

- manual SMTP provider acceptance
- internal ATI inbox receipt
- frozen NotificationJob business-content provider acceptance
- frozen NotificationJob business-content inbox receipt
- correct governed subject/body rendering

The observed corporate confidentiality footer is not present in the application template source and is therefore downstream mail-system decoration outside the frozen ATI PH content hash.

See `docs/LOCAL-EMAIL-TESTING.md`.

## 11. Google Workspace direction

Google Workspace Admin documentation currently recommends SMTP relay for apps/devices.

Production candidate:

```text
smtp-relay.gmail.com
587
TLS
```

Developer direct-SMTP example:

```text
smtp.gmail.com
587
TLS
full Workspace email address
approved application credential / App Password when account policy permits
```

Normal Google login passwords must not be used.

Official references:

- https://support.google.com/a/answer/176600
- https://support.google.com/accounts/answer/185833

ATI IT owns relay policy, IP authorization, sender restrictions, and credential policy.

## 12. Fallback safety

No automatic provider fallback exists today.

A timeout is not proof that a provider failed to accept a message.

Future fallback can occur only with explicit evidence that duplicate delivery cannot result.

Rules:

```text
ACCEPTED
→ never fallback

OUTCOME_UNKNOWN
→ never automatic fallback

recipient permanent rejection
→ do not switch provider automatically

known pre-acceptance transport failure
→ future approved fallback may be considered
```

## 13. Delivery evidence

Provider acceptance is not final recipient delivery.

Current durable evidence can include:

- attempt number
- claimed time
- lease expiry
- completed time
- transport/provider code
- provider message ID
- failure class
- sanitized error code/message
- retry timing
- final job state

Future bounce/NDR correlation remains a separate capability.

## 14. Current production gate

Production-safe default:

```env
EMAIL_DELIVERY_MODE=DISABLED
EMAIL_SMTP_TEST_ENABLED=false
EMAIL_SMTP_PILOT_ENABLED=false
EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED=false
EMAIL_DELIVERY_KILL_SWITCH=true
EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED=false
```

Automatic SMTP worker execution is implemented

Non-production execution requires automatic enablement and an inactive kill switch

Production execution additionally requires explicit `EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED=true`

The runtime kill-switch file can stop new SMTP claims on the next worker polling cycle

No provider fallback is automatic

## 15. Before production SMTP unlock

Software controls completed:

- provider-neutral Email Delivery Engine
- generic SMTP transport
- durable attempt/retry/lease contract
- frozen governed content and SHA-256
- manual direct-SMTP connectivity validation
- same-domain internal inbox confirmation
- controlled frozen-NotificationJob SMTP pilot
- exact recipient evidence
- partial/incomplete fail-closed semantics
- OUTCOME_UNKNOWN reconciliation UI
- bounded retry
- SMTP non-retry-safe lease recovery
- automatic SMTP worker gate
- kill switch
- production-only release approval
- operational delivery alerting
- readiness and production runbook

External activation evidence still required:

- ATI IT-approved production sender/relay route
- approved production secret-management path
- authorized client-recipient scope
- monitoring/runbook ownership
- controlled production delivery acceptance where required
- business-owner acceptance
- attachment contract if Operations requires one
- bounce/NDR ingestion only when required by the operating model

See `docs/PRODUCTION-DEPLOYMENT-AI-AGENT.md`

## 16. Platform evolution

### Stage 1 — reusable module

Current state.

Lives inside `ati-ph`.

### Stage 2 — shared internal capability

Triggered by a second real application using the same delivery contract.

Requires:

- named platform owner
- shared authorization model
- shared provider registry
- consumer isolation
- shared observability
- versioned consumer contract

### Stage 3 — independently deployed platform

Only when scale, reliability, security, or release independence justify extraction.

## 17. Related documents

- `README.md`
- `architecture.md`
- `plan.md`
- `PROPOSAL.md`
- `docs/LOCAL-EMAIL-TESTING.md`
- `docs/ACCESS-CONTROL.md`
- `docs/DATABASE-SCHEMA-BOUNDARIES.md`
