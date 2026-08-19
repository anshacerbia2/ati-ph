# ATI Email Delivery Engine

Reusable provider-neutral email delivery module inside `ati-ph`.

## Boundary

```text
Business notification
→ EmailMessage
→ Sender Identity
→ Transport Route
→ Email Transport
```

Sender identity and transport are separate:

```text
PH_NOTIFICATION
→ apps@atibusinessgroup.com
→ ATI_GOOGLE_DIRECT / ATI_GOOGLE_RELAY / SAFE_STREAM
→ SMTP or STREAM
```

Changing sender domain or SMTP vendor must not require changes to Public Holiday business logic.

## Current implementation

Implemented:

- provider-neutral `EmailMessage`
- sender identity
- static transport routing
- deterministic Message-ID from idempotency key
- `X-ATI-Idempotency-Key`
- STREAM adapter
- generic SMTP adapter
- Nodemailer 9.x security baseline
- file/URL attachment resolution disabled
- frozen Public Holiday content integration
- explicit gated manual SMTP connectivity test

Not implemented:

- automatic production NotificationJob SMTP execution
- automatic provider failover
- provider HTTP API adapters
- bounce/NDR webhook ingestion
- dynamic database provider registry

## Modes

### DISABLED

```env
EMAIL_DELIVERY_MODE=DISABLED
```

No delivery engine is created.

This is the production-safe default.

### STREAM

```env
EMAIL_DELIVERY_MODE=STREAM
EMAIL_SENDER_IDENTITY_CODE=PH_NOTIFICATION
EMAIL_FROM_ADDRESS=apps@atibusinessgroup.com
EMAIL_FROM_NAME=ATI Business Group
EMAIL_TRANSPORT_CODE=SAFE_STREAM
```

STREAM generates a complete email in memory and sends nothing externally.

The worker currently executes eligible notification jobs in STREAM mode, so use it only with a test/local database when durable job-state changes are acceptable.

### SMTP

SMTP creates the generic Nodemailer transport.

Configuration:

```env
EMAIL_DELIVERY_MODE=SMTP
EMAIL_SENDER_IDENTITY_CODE=PH_NOTIFICATION
EMAIL_FROM_ADDRESS=apps@atibusinessgroup.com
EMAIL_FROM_NAME=ATI Business Group
EMAIL_REPLY_TO=
EMAIL_TRANSPORT_CODE=ATI_PRIMARY

EMAIL_SMTP_HOST=
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_REQUIRE_TLS=true
EMAIL_SMTP_USER=
EMAIL_SMTP_PASSWORD=
EMAIL_SMTP_CONNECTION_TIMEOUT_MS=10000
```

SMTP mode alone does not unlock NotificationJob execution.

The worker intentionally refuses to claim NotificationJobs for SMTP today.

## Manual SMTP connectivity test

The repository exposes:

```cmd
npm run email:smtp:test -- --send
```

Required test gates:

```env
EMAIL_DELIVERY_MODE=SMTP
EMAIL_SMTP_TEST_ENABLED=true
EMAIL_SMTP_TEST_RECIPIENT=<SAME_DOMAIN_RECIPIENT>
```

The command also requires explicit `--send`.

Recipient domain must match the domain of `EMAIL_FROM_ADDRESS`.

The manual script:

- opens SMTP only after all gates pass
- sends exactly one technical test message
- does not access Prisma
- does not load or claim NotificationJobs
- does not unlock automatic delivery

See `docs/LOCAL-EMAIL-TESTING.md` for the full runbook.

## Google Workspace examples

Developer direct-SMTP example:

```env
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_REQUIRE_TLS=true
```

Use an ATI/Google-approved application credential such as an App Password only when the Workspace/account policy allows it.

Production relay target example:

```env
EMAIL_SMTP_HOST=smtp-relay.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_REQUIRE_TLS=true
```

Relay authorization is owned by ATI IT/Google Workspace administration.

Do not use a normal Google account password.

## Delivery semantics

Provider acceptance and recipient delivery are different states.

The current transport result records:

```text
transportCode
providerMessageId
accepted[]
rejected[]
```

Do not present SMTP acceptance as confirmed mailbox delivery.

## Retry safety

Notification delivery attempts classify failure as:

```text
RETRYABLE
TERMINAL
OUTCOME_UNKNOWN
```

`OUTCOME_UNKNOWN` is never automatically retried.

Lease recovery is retryable only when the durable attempt explicitly records `leaseRetrySafe=true`.

STREAM is currently retry-safe after lease expiry because it has no external side effect.

Future external transports must not be marked lease-retry-safe unless their acceptance/idempotency semantics prove that duplicate delivery cannot occur.

## Fallback

There is no implicit provider fallback.

A timeout can happen after provider acceptance.

Therefore automatic fallback must remain disabled until provider acceptance and unknown-outcome semantics are explicitly resolved.

## Secrets

SMTP credentials remain environment secrets.

Never store raw provider credentials in:

- source code
- Prisma rows
- audit metadata
- rendered email artifacts
- README examples
- test fixtures
- logs

## Verification

Full:

```cmd
npm run verify
```

Focused email tests:

```cmd
npx vitest run src/email
```

Manual real SMTP test:

```cmd
npm run email:smtp:test -- --send
```

The last command sends a real email and must only be run after the explicit test environment is configured.
