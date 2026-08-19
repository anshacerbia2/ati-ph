# ATI Email Delivery Engine

Business applications submit an `EmailMessage` using a logical `senderIdentityCode`

```text
EmailMessage
→ Sender Identity
→ Transport Route
→ Email Transport
```

Sender identity and transport are separate

```text
PH_NOTIFICATION
→ apps@atibusinessgroup.com
→ ATI_PRIMARY
→ generic SMTP
```

Changing the sender domain or SMTP vendor does not change business logic

Current adapters

- `STREAM` generates the complete email in memory and sends nothing externally
- `SMTP` uses a generic Nodemailer SMTP transport

Google Workspace SMTP, Brevo SMTP, SMTP2GO SMTP, or another standards-compatible SMTP service can use the same adapter through configuration

Provider-specific HTTP API adapters can later implement the same `EmailTransport` interface

Safety

- Delivery is disabled by default
- No automatic provider fallback
- Deterministic Message-ID from the business idempotency key
- `X-ATI-Idempotency-Key` outbound header
- Attachments use in-memory bytes
- File and URL attachment resolution disabled
- SMTP credentials stay in environment secrets

Configuration

```text
EMAIL_DELIVERY_MODE=DISABLED
EMAIL_SENDER_IDENTITY_CODE=PH_NOTIFICATION
EMAIL_FROM_ADDRESS=
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

For safe local validation use `EMAIL_DELIVERY_MODE=STREAM`

ATI PH notification jobs are intentionally not wired to this engine in this slice
