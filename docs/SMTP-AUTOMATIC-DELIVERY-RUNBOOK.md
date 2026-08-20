# SMTP Automatic Delivery Runbook

## Safety state

Automatic SMTP execution is implemented but fails closed unless both release controls permit it

```text
EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED=true
EMAIL_DELIVERY_KILL_SWITCH=false
```

Default behavior remains blocked because automatic enablement defaults to `false` and the static kill switch defaults to `true`

## Runtime kill-switch file

Set `EMAIL_DELIVERY_KILL_SWITCH_PATH` to a path visible to the worker

If that file exists, the worker stops claiming new SMTP NotificationJobs on its next polling cycle even when automatic SMTP is otherwise enabled

Example

```text
EMAIL_DELIVERY_KILL_SWITCH_PATH=.runtime/email-delivery.kill
```

Creating the file blocks new SMTP claims

Removing the file restores eligibility only when the explicit automatic enablement flag is `true` and the static kill switch is `false`

## Claim semantics

STREAM claims remain `leaseRetrySafe=true`

SMTP claims use `leaseRetrySafe=false`

An expired SMTP claim therefore becomes `OUTCOME_UNKNOWN` instead of being blindly retried

## Recipient outcome semantics

```text
exact full acceptance
→ SENT

exact full rejection with zero accepted recipients
→ RETRYABLE within the existing retry ceiling

partial acceptance
→ OUTCOME_UNKNOWN
→ no automatic retry

incomplete or inconsistent recipient evidence
→ OUTCOME_UNKNOWN
→ no automatic retry

generic SMTP exception after the external send attempt begins
→ OUTCOME_UNKNOWN
→ no automatic retry
```

## Reconciliation

`OUTCOME_UNKNOWN` attempts appear in the delivery reconciliation queue

An authorized notification approver must provide a note and choose exactly one action

- `MARK_SENT` records that external evidence proves delivery and moves the NotificationJob to `SENT`
- `RETRY` explicitly accepts duplicate-send risk and moves the NotificationJob back to `DUE`
- `FAIL` closes the NotificationJob as `FAILED`

Every decision records actor, time, action, note, audit evidence, and an outbox event

## No provider fallback

Automatic fallback from one outbound provider or relay to another is intentionally not implemented

Changing transport route remains an explicit operational decision
