# ATI PH Local Email Testing

| Metadata | Value |
| --- | --- |
| Status | Active |
| Version | 1.3 |
| Date | 2026-08-21 |
| Scope | Automated, STREAM, SMTP connectivity, controlled NotificationJob SMTP validation, and seeded delivery-test routing |
| Automatic production SMTP | Gated |
| Verified controlled SMTP path | Google Workspace direct SMTP to same-domain internal ATI mailbox |

## Purpose

Define exactly how ATI PH email delivery can be validated without accidentally enabling production notification sending.

There are four distinct levels:

```text
1. automated unit/contract verification
2. STREAM in-memory transport
3. explicit manual SMTP connectivity test
4. controlled NotificationJob SMTP business-content pilot
```

These levels are intentionally separate.

```text
SMTP connectivity success
≠
NotificationJob pilot success
≠
automatic production SMTP release
```

The worker is not required for either real SMTP test.

## 0. Which profile you are in

This document describes the levels. **Which level a deployment is at is decided by the
environment file, and by nothing else** — see
[`ENVIRONMENT-PROFILES.md`](./ENVIRONMENT-PROFILES.md).

| Profile | Level available | Worker |
| --- | --- | --- |
| `.env.local.example` | 2 (STREAM) and 3 (connectivity test) | disabled |
| `.env.test.example` | 4 (controlled pilot) | enabled, delivers nothing |
| `.env.production.example` | automatic delivery | enabled |

Copy one whole profile. The variable groups documented below are what those profiles
set; they are listed here so each level's ownership is explicit, not so that a profile
gets assembled from them by hand.

Two combinations that read as sensible are refused at boot, because both start and then
behave as though a flag you set were not set:

```text
EMAIL_SMTP_TEST_ENABLED=true + EMAIL_SMTP_PILOT_ENABLED=true
  -> two validations, two recipients; a profile has to say which

EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED=true + either manual command
  -> both send as the same sender through the same transport, so a message in the
     inbox no longer says which path produced it
```

## 1. Environment-variable ownership

### Shared SMTP transport settings

Both real SMTP test commands use the same transport configuration:

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

For controlled development validation, the current proven transport is:

```text
smtp.gmail.com
port 587
STARTTLS
ATI_GOOGLE_DIRECT
```

Do not use a normal Google account password.

### Connectivity-test-only settings

```env
EMAIL_SMTP_TEST_ENABLED=true
EMAIL_SMTP_TEST_RECIPIENT=your.name@atibusinessgroup.com
```

These settings are read only by:

```cmd
npm run email:smtp:test -- --send
```

### NotificationJob-pilot-only settings

```env
EMAIL_SMTP_PILOT_ENABLED=true
EMAIL_SMTP_PILOT_RECIPIENT=your.name@atibusinessgroup.com
```

These settings are read only by:

```cmd
npm run notification:smtp:pilot -- --job <notification-job-uuid> --send
```

### Safe switch between the two real SMTP tests

Connectivity test:

```env
EMAIL_SMTP_TEST_ENABLED=true
EMAIL_SMTP_PILOT_ENABLED=false
```

Business-content pilot:

```env
EMAIL_SMTP_TEST_ENABLED=false
EMAIL_SMTP_PILOT_ENABLED=true
```

The inactive recipient variable may remain configured.

For example, this is safe:

```env
EMAIL_SMTP_TEST_ENABLED=false
EMAIL_SMTP_TEST_RECIPIENT=your.name@atibusinessgroup.com

EMAIL_SMTP_PILOT_ENABLED=true
EMAIL_SMTP_PILOT_RECIPIENT=your.name@atibusinessgroup.com
```

The enable flags, not the presence of the recipient strings, decide whether each command is allowed.

## 2. Automated verification

Run:

```cmd
npm run verify
```

Current email-related coverage includes:

- Email Delivery Engine routing
- deterministic Message-ID behavior
- STREAM transport
- generic SMTP transport contract
- governed Public Holiday email template
- frozen content SHA-256
- email composer fail-closed behavior
- retry and lease recovery
- manual SMTP connectivity gates
- manual SMTP/database isolation
- controlled NotificationJob SMTP pilot gates
- pilot same-domain recipient restriction
- pilot no-durable-mutation contract
- worker SMTP gate

For focused tests:

```cmd
npx vitest run src/email src/notifications
```

The complete repository suite remains the final gate.

## 3. STREAM mode

STREAM generates the complete message in memory and never opens an SMTP connection.

Local configuration:

```env
EMAIL_DELIVERY_MODE=STREAM
EMAIL_SENDER_IDENTITY_CODE=PH_NOTIFICATION
EMAIL_FROM_ADDRESS=apps@atibusinessgroup.com
EMAIL_FROM_NAME=ATI Business Group
EMAIL_TRANSPORT_CODE=SAFE_STREAM

NOTIFICATION_DELIVERY_BATCH_SIZE=25
NOTIFICATION_DELIVERY_LEASE_SECONDS=120
```

The worker can then be run:

```cmd
npm run worker
```

### STREAM warning

The worker treats STREAM as an executable delivery transport.

Eligible database jobs may therefore be claimed and their durable delivery state may change even though no external message is sent.

Use STREAM worker execution only against a local/test database whose delivery state may safely change.

For code validation without database delivery-state changes, use:

```cmd
npm run verify
```

## 4. Manual SMTP connectivity test

### Purpose

Validate:

```text
credentials
TLS
SMTP host/port
sender identity
provider acceptance
```

It is deliberately isolated from:

```text
Prisma
NotificationJob
scheduler
approval
automatic worker delivery
```

The worker is not required.

### Required gate

```env
EMAIL_DELIVERY_MODE=SMTP
EMAIL_SMTP_TEST_ENABLED=true
EMAIL_SMTP_TEST_RECIPIENT=your.name@atibusinessgroup.com
```

The recipient must have the same domain as `EMAIL_FROM_ADDRESS`.

### Command

```cmd
npm run email:smtp:test -- --send
```

### Refusal conditions

The command refuses delivery unless:

- mode is SMTP
- test flag is explicitly true
- test recipient exists
- recipient domain equals sender domain
- command contains `--send`

### Expected success

```text
SMTP MANUAL TEST ACCEPTED
```

Output includes:

- recipient
- transport code
- provider message ID when returned
- accepted addresses
- rejected addresses

Provider acceptance means the SMTP provider accepted the message for processing.

It is not proof that the recipient inbox received it.

### Verified result — 2026-08-20

The current `ATI_GOOGLE_DIRECT` configuration returned SMTP acceptance for the same-domain internal test recipient and the message arrived in the ATI inbox.

This validates the development/pilot direct-SMTP route.

It does not authorize that route for production.

## 5. Controlled NotificationJob SMTP business-content pilot

### Purpose

Validate the real frozen ATI PH business message through the real SMTP transport without sending to the job's frozen client recipients.

This is a pre-production validation gate, not production delivery.

### Job eligibility

The selected NotificationJob must:

- exist
- be `PLANNED` or `DUE`
- contain frozen `contentSnapshot`
- contain frozen `contentSha256`
- pass the content SHA-256 integrity check

Jobs created before the frozen-content migration remain intentionally ineligible when they have no content snapshot/hash.

Do not backfill those legacy jobs merely to make a pilot pass.

### Required gate

```env
EMAIL_DELIVERY_MODE=SMTP

EMAIL_SMTP_TEST_ENABLED=false

EMAIL_SMTP_PILOT_ENABLED=true
EMAIL_SMTP_PILOT_RECIPIENT=your.name@atibusinessgroup.com
```

The pilot recipient must use the same domain as `EMAIL_FROM_ADDRESS`.

### Command

```cmd
npm run notification:smtp:pilot -- --job <notification-job-uuid> --send
```

Do not use literal `...` as the job ID.

The argument must be a real NotificationJob UUID.

### Safety behavior

The pilot uses:

```text
frozen NotificationJob content
→ checksum verification
→ original frozen subject/body
→ TO overridden to one internal pilot recipient
→ CC/BCC cleared
→ real SMTP adapter
```

It intentionally does not:

- send to the job's frozen client recipient snapshot
- claim the NotificationJob
- create NotificationDeliveryAttempt
- mutate NotificationJob status
- increment attempt count
- set sentAt
- set failedAt
- unlock automatic SMTP worker execution

The worker is not required and should normally remain stopped during this controlled pilot to reduce unrelated moving parts.

### Expected success

```text
CONTROLLED SMTP PILOT
...
NOTIFICATION SMTP PILOT PASS
```

The result should show:

```text
accepted: [same-domain internal ATI recipient]
rejected: []
durableNotificationJobMutated: false
```

### Verified result — 2026-08-20

The controlled pilot was successfully executed using:

```text
transport: ATI_GOOGLE_DIRECT
sender: apps@atibusinessgroup.com
recipient scope: same-domain internal ATI mailbox
business example: Ticketing UK
holiday: Example Holiday Gamma
date: 15 March 2027
provider acceptance: confirmed
inbox arrival: confirmed
```

The inbox-rendered subject and ATI PH governed body matched the frozen business content.

An additional corporate confidentiality footer appeared after the governed ATI PH body.

The current application template source ends at:

```text
Regards,
ATI Public Holiday Notification
```

Therefore the observed confidentiality footer is downstream mail-system decoration and is outside the ATI PH frozen `contentSnapshot` / `contentSha256`.

## 6. Google Workspace guidance

### Development/pilot direct SMTP

Current proven controlled configuration:

```text
smtp.gmail.com
port 587
STARTTLS
full Workspace email address
approved application credential
```

Google App Password availability depends on account and organization security policy.

If application credentials are unavailable, involve the Google Workspace administrator.

Never substitute a normal Google login password.

Official references:

- https://support.google.com/a/answer/176600
- https://support.google.com/accounts/answer/185833

### Production direction

Google Workspace SMTP relay remains the preferred production candidate when ATI IT approves the route:

```text
smtp-relay.gmail.com
port 587
TLS
```

ATI IT owns:

- relay authorization
- sender restrictions
- IP allowlisting where used
- SMTP-auth requirements
- credential policy
- production secret-management path

The repository must not guess these controls.

## 6.1 SMTP recipient outcome safety

The delivery contract evaluates the complete requested recipient set before an SMTP attempt may become SENT.

```text
all requested recipients accepted
→ SENT

all requested recipients explicitly rejected
→ RETRYABLE
→ bounded by retryCeiling

partial acceptance or incomplete recipient evidence
→ OUTCOME_UNKNOWN
→ no automatic retry

generic SMTP send exception after the external send attempt begins
→ OUTCOME_UNKNOWN
→ no automatic retry
```

Provider-reported accepted and rejected recipient arrays are persisted on the delivery attempt. The SMTP executor is connected to the worker behind explicit automatic enablement, kill-switch, and production-release controls.

## 7. Production safety state

Production remains fail-closed by default:

```env
EMAIL_DELIVERY_MODE=DISABLED
EMAIL_SMTP_TEST_ENABLED=false
EMAIL_SMTP_PILOT_ENABLED=false
EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED=false
EMAIL_DELIVERY_KILL_SWITCH=true
EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED=false
```

Current worker behavior:

```text
STREAM
→ may claim and execute eligible jobs
→ leaseRetrySafe=true

SMTP with release controls closed
→ does not claim SMTP jobs

SMTP with automatic enabled + kill switch inactive
→ may claim eligible SMTP jobs outside production

SMTP in NODE_ENV=production
→ additionally requires EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED=true
→ leaseRetrySafe=false
```

A successful connectivity test or controlled pilot does not remove the worker release gate

### 7.1 Local production-path worker validation

When intentionally testing the production worker/email path locally, use a dedicated local/test database and a deliberately safe NotificationJob recipient snapshot

Before opening automatic SMTP locally:

- prove there is no unintended eligible client-recipient DUE/RETRY job
- use one controlled same-domain internal recipient
- preserve a database snapshot
- set `NODE_ENV=production` so the production-only release flag is exercised
- enable the SMTP production release controls only for the test window
- stop the worker immediately after the intended delivery is observed
- return automatic enablement to false and kill switch to true after the test

Do not use an existing production-like database with unknown eligible recipients for this validation

The exact local execution steps should be performed interactively and reviewed immediately before the worker is started

### 7.2 Seeded delivery-test routing

§7.1 requires "a deliberately safe NotificationJob recipient snapshot". `seedDeliveryTestRouting` in `prisma/seed.ts` is what produces one, so that requirement does not have to be met by hand each time.

#### Why it is needed at all

Every `Client_Master` contact is `@dummy.test`, which is correct and also means the estate cannot demonstrate a *successful* send. Recipient classification is fail-closed on partial acceptance, so a single undeliverable address marks the whole job `FAILED`:

```text
all accepted            -> SENT
all rejected            -> RETRYABLE
partial / incomplete    -> OUTCOME_UNKNOWN
```

A job made only of `@dummy.test` therefore proves that SMTP rejects correctly. That is worth knowing and is not delivery.

#### What is seeded

```text
Client "Test" -> ServiceTeam "Test" -> ClientSubscription (region SG)
  -> Contact  <recipient>   TO, and nothing else
  -> NotificationPolicyVersion v1
       CLIENT_OVERRIDE, lead 5 CALENDAR_DAY, 09:00 Australia/Sydney,
       weekendAdjustment NONE, approvalMode NOT_REQUIRED,
       automaticSendAllowed TRUE
```

The recipient is `DELIVERY_TEST_RECIPIENT`, falling back to `EMAIL_SMTP_PILOT_RECIPIENT`. **Neither set, nothing is seeded** — a fresh install gets the estate it had before this existed.

Three of those values are load-bearing:

- **Region `SG`.** `Client_Master` places no subscription there, so a Singapore holiday reaches this row and nothing else. A holiday imported for any other region cannot touch it.
- **`approvalMode: NOT_REQUIRED`.** The global policy is `REQUIRED`, and notification maker-checker refuses an approver who is also the committer — a second person for a step that proves nothing about SMTP. Lead time, send time and timezone are copied from the global policy, so only the approval gate differs.
- **`automaticSendAllowed: true`.** See below.

The seed also fails loudly if a second recipient ever appears on that subscription. A stray `@dummy.test` CC would be rejected by the provider and mark the job `FAILED` *after* the real recipient had already received the mail — which reads as "delivery is broken" and is the most misleading outcome this row can produce.

#### Why `automaticSendAllowed` is here and nowhere else

The worker only claims jobs where it is true:

```sql
WHERE job."status" = 'DUE' AND job."automaticSendAllowed" = TRUE
```

It is copied onto each job from the policy version at commit time, and `notificationPolicySchema` refuses to set it — *"Automatic send cannot be enabled before the controlled delivery phase."* No API call, admin screen or UI toggle can produce a claimable job. That refusal is deliberate and stays.

The seed writes through Prisma and is therefore the one path around it. It is confined to a row that exists only when a recipient is configured and can reach only that recipient. **It does not make anything send**: `EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED` (default false) and `EMAIL_DELIVERY_KILL_SWITCH` (default **true**) both still stand in front of every SMTP execution.

When the controlled delivery phase opens, the correct change is to lift the refusal in `policy.ts` and grant this through approval — not to keep this seed path as the mechanism.

#### Fixture workbook

`docs/ATI-PH-E2E-Delivery-Test.xlsx` — one `Holiday_Master` row that lands on the routing above:

| Region | PH Name | PH Start Date | PH End Date |
| --- | --- | --- | --- |
| SG | E2E Delivery Verification | 2026-08-25 | 2026-08-25 |

The date is chosen so the job is already overdue rather than months away:

```text
2026-08-25  holiday
     -5     lead, calendar days
2026-08-20  planned local date, 09:00 Australia/Sydney
          = 2026-08-19T23:00Z  -> already past, so the first scheduler cycle marks it DUE
```

Dates are ISO text rather than typed Excel dates — the contract accepts both, and text carries no serial-number or timezone interpretation. The name avoids `sample` and `xxx`, which trigger `SAMPLE_ROW_DETECTED`.

**Re-importing the same file is refused** by `EXACT_FILE_DUPLICATE`, and a different file with the same holiday content by `SAME_HOLIDAY_DATA`. For a second run, change the holiday date and recompute the arithmetic above.

#### Sequence

```text
upload workbook -> validate -> submit for approval
  -> a different user approves        (import maker-checker; no exemption)
  -> publish
  -> planning preview -> commit
  -> one PLANNED job, automaticSendAllowed=true, single internal recipient
```

Then follow §7.1 for the worker window.

#### Removal

Delete the `Test` client's subscription, or unset both recipient variables and reset the database. Nothing else references it.

## 8. Secrets

Never commit or paste:

- `EMAIL_SMTP_PASSWORD`
- Google App Password
- OAuth refresh/access token
- SMTP relay credential
- Keycloak client secret
- database password
- session secret

`.env` is local-only and ignored by Git.

Only sanitized placeholders belong in the committed profiles — `.env.local.example`,
`.env.test.example` and `.env.production.example`. `npm run verify:fast` parses all
three against the real schema, so a placeholder that stops being valid fails there;
that check reads values, and a real secret committed by accident would pass it. The
`.gitignore` on `.env` is what keeps secrets out, not this.

## 9. Before automatic production SMTP release

Software evidence completed:

- generic SMTP adapter
- direct SMTP connectivity accepted
- same-domain internal technical inbox receipt
- frozen NotificationJob business-content pilot
- governed subject/body confirmation
- exact accepted/rejected recipient persistence
- partial/incomplete outcome fail-closed behavior
- OUTCOME_UNKNOWN reconciliation
- bounded retry
- non-retry-safe SMTP lease recovery
- automatic worker SMTP gate
- kill switch
- production-only release approval
- operational alerts and worker heartbeat
- production readiness and deployment runbook

External release evidence still required:

- ATI IT-approved production sender/relay route
- approved production secret-management path
- authorized client-recipient production scope
- monitoring and alert ownership
- controlled production/client-recipient acceptance where required
- Operations confirmation of any required attachment
- business-owner production acceptance
- bounce/NDR ingestion only if required by the operating model

See `docs/PRODUCTION-DEPLOYMENT-AI-AGENT.md`
