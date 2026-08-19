# ATI PH Local Email Testing

| Metadata | Value |
| --- | --- |
| Status | Active |
| Version | 1.1 |
| Date | 2026-08-20 |
| Scope | Automated, STREAM, SMTP connectivity, and controlled NotificationJob SMTP validation |
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

## 7. Production safety state

Production remains fail-closed:

```env
EMAIL_DELIVERY_MODE=DISABLED
EMAIL_SMTP_TEST_ENABLED=false
EMAIL_SMTP_PILOT_ENABLED=false
```

Current worker rule:

```text
STREAM
→ may claim and execute eligible notification jobs

SMTP
→ logs gated warning
→ does not claim NotificationJobs
```

A successful connectivity test or controlled pilot does not remove this worker gate.

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

Only sanitized placeholders belong in `.env.example` and `.env.production.example`.

## 9. Before automatic production SMTP release

Completed evidence:

- generic SMTP adapter implemented
- direct SMTP connectivity accepted
- same-domain internal technical test reached inbox
- frozen NotificationJob business-content pilot accepted
- frozen business-content pilot reached inbox
- governed subject/body rendering visually confirmed
- automatic worker SMTP remained gated throughout testing

Still required:

- ATI IT-approved production sender/relay route
- production secret-management path
- controlled production/client-recipient pilot scope and approval
- partial SMTP acceptance semantics
- unknown-outcome manual remediation path
- bounce/NDR ingestion where required
- production monitoring and runbook
- kill-switch behavior
- rollback procedure
- Operations confirmation of any required output attachment contract
- explicit release review before worker SMTP claim is enabled
