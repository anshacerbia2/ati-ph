# ATI PH Local Email Testing

| Metadata | Value |
| --- | --- |
| Status | Active |
| Version | 1.0 |
| Date | 2026-08-19 |
| Scope | Local and controlled SMTP/STREAM validation |
| Automatic production SMTP | Gated |

## Purpose

Define exactly how email delivery can be tested without accidentally enabling production notification sending.

There are three distinct test levels:

```text
1. unit/contract tests
2. STREAM in-memory transport
3. explicit manual SMTP connectivity test
```

A successful manual SMTP test does **not** enable automatic SMTP `NotificationJob` execution.

## 1. Automated email tests

Run the complete repository verification:

```cmd
npm run verify
```

Current email-related coverage includes:

- Email Delivery Engine routing
- STREAM transport
- generic SMTP transport contract
- governed PH email template
- frozen email content checksum
- email composer fail-closed behavior
- delivery executor
- retry and lease recovery rules
- manual SMTP safety rules
- manual SMTP/database isolation contract
- worker SMTP gate

For a focused Vitest run:

```cmd
npx vitest run src/email
```

The complete suite is still the required final gate.

## 2. STREAM mode

STREAM generates the complete email in memory and never opens an SMTP connection.

Local `.env`:

```env
EMAIL_DELIVERY_MODE=STREAM
EMAIL_SENDER_IDENTITY_CODE=PH_NOTIFICATION
EMAIL_FROM_ADDRESS=apps@atibusinessgroup.com
EMAIL_FROM_NAME=ATI Business Group
EMAIL_TRANSPORT_CODE=SAFE_STREAM

NOTIFICATION_DELIVERY_BATCH_SIZE=25
NOTIFICATION_DELIVERY_LEASE_SECONDS=120
```

Then the worker can be run with:

```cmd
npm run worker
```

### STREAM warning

The current worker treats STREAM as an executable delivery transport.

That means eligible local/test database jobs may be claimed and their durable delivery state may change even though no external message is sent.

Do not run STREAM worker execution against a database whose delivery-state evidence must remain production-truth.

For code validation without database state changes, use `npm run verify`.

## 3. Manual SMTP connectivity test

The manual test exists to validate:

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

### Required local `.env`

Example for Google Workspace direct SMTP:

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

EMAIL_SMTP_TEST_ENABLED=true
EMAIL_SMTP_TEST_RECIPIENT=<YOUR_EMAIL>@atibusinessgroup.com
```

Never use or commit a normal account password.

Google Workspace currently documents `smtp.gmail.com` with TLS on port 587 for direct SMTP and an App Password for supported account configurations.

App Password availability depends on Google account and organization security configuration.

### Explicit send command

```cmd
npm run email:smtp:test -- --send
```

This command sends one real technical test email.

### Safety gates

The command refuses delivery unless:

- `EMAIL_DELIVERY_MODE=SMTP`
- `EMAIL_SMTP_TEST_ENABLED=true`
- `EMAIL_SMTP_TEST_RECIPIENT` exists
- command includes `--send`
- recipient domain equals sender domain

With:

```text
EMAIL_FROM_ADDRESS=apps@atibusinessgroup.com
```

this means the manual test recipient must also use:

```text
@atibusinessgroup.com
```

### Expected success

```text
SMTP MANUAL TEST ACCEPTED
```

The output includes:

- recipient
- transport code
- provider message ID when returned
- accepted addresses
- rejected addresses

Provider acceptance proves that the SMTP provider accepted the message for processing. It does not prove final recipient delivery.

### Refused test

If a safety gate is missing:

```text
SMTP MANUAL TEST REFUSED
No email was sent
```

### Failed connection or authentication

A provider/TLS/authentication error prints:

```text
SMTP MANUAL TEST FAILED
```

Do not weaken TLS or bypass the safety gates to make a failing provider test pass.

## 4. Google Workspace local test

For a developer workstation, the current direct-SMTP example is:

```text
smtp.gmail.com
port 587
STARTTLS
```

Use an application credential approved by ATI/Google Workspace policy.

Google documentation states that App Passwords require 2-Step Verification and may not be available for some work/organization or Advanced Protection configurations.

If App Passwords are unavailable, involve the Google Workspace administrator instead of using the normal account password.

Official references:

- https://support.google.com/a/answer/176600
- https://support.google.com/accounts/answer/185833

## 5. Production Google Workspace direction

Google Workspace Admin documentation recommends SMTP relay for devices/apps.

Target example:

```text
smtp-relay.gmail.com
port 587
TLS
```

Production relay authorization, sender restrictions, IP allowlisting, and SMTP-auth requirements are owned by ATI IT/Google Workspace administration.

The repository must not assume those policies.

Official reference:

- https://support.google.com/a/answer/176600

## 6. Production safety state

Production examples remain:

```env
EMAIL_DELIVERY_MODE=DISABLED
EMAIL_SMTP_TEST_ENABLED=false
```

Even when SMTP is configured, the current ATI PH worker does not claim production notification jobs in SMTP mode.

Current worker rule:

```text
STREAM
→ claim and execute eligible notification jobs

SMTP
→ log gated warning
→ do not claim notification jobs
```

Automatic SMTP execution requires a separate reviewed release slice.

## 7. Secrets

Never commit:

- `EMAIL_SMTP_PASSWORD`
- Google App Password
- Google OAuth refresh/access tokens
- SMTP relay credentials
- Keycloak client secret
- database password
- session secret

`.env` is ignored by Git.

Only sanitized placeholders belong in `.env.example` or `.env.production.example`.

## 8. Before any automatic SMTP release

Required before removing the worker gate:

- production sender/relay route approved by ATI IT
- controlled real-recipient pilot completed
- partial SMTP acceptance semantics reviewed
- unknown-outcome/manual remediation path agreed
- production STREAM semantics separated from real SENT evidence if STREAM remains available
- Operations approves final email content
- any required output attachment contract is confirmed
- monitoring and runbook are ready
