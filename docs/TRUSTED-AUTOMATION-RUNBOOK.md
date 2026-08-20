# Trusted Automation Runbook

## Default safety state

Trusted planning automation is implemented but defaults to shadow-only

```text
NOTIFICATION_TRUSTED_AUTOMATION_ENABLED=false
```

In shadow-only mode the worker scans published uncommitted holidays, records operational alerts, and does not auto-commit notification plans

SMTP automatic delivery remains a separate release decision

Base SMTP automatic controls:

```text
EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED=true
EMAIL_DELIVERY_KILL_SWITCH=false
```

Production additionally requires:

```text
EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED=true
```

Enabling trusted planning automation does not open SMTP delivery

## Planning automation

The worker scans current published holiday occurrences inside the configured horizon

```text
NOTIFICATION_AUTOMATION_BATCH_SIZE=50
NOTIFICATION_AUTOMATION_HORIZON_DAYS=400
```

When trusted automation is enabled, a READY plan is committed using the original holiday publisher as the traceable actor and records commit source `AUTOMATION`

Policy approval remains authoritative

- `NOT_REQUIRED` jobs can move directly to `PLANNED`
- `REQUIRED` jobs move to `WAITING_APPROVAL`
- matching or schedule exceptions do not auto-commit
- zero active TO recipients produce a CRITICAL operational alert

## Corrections

A correction can supersede a holiday after notification planning or delivery has started, except while a job is actively `PROCESSING`

Before a correction is published

- notification job rows are locked against concurrent worker claim
- unsent `WAITING_APPROVAL`, `PLANNED`, `DUE`, and `RETRY_WAIT` jobs are cancelled
- pending notification approval is cancelled
- already `SENT` evidence is preserved
- unresolved unknown outcomes remain available for reconciliation

Every new notification plan created from a corrected occurrence is forced to `REQUIRED` approval even when the normal client policy says approval is not required

A superseded occurrence can still be reconciled as delivered or failed, but it cannot be manually retried

## Alerts

Persistent operational alert types

- `ZERO_RECIPIENT`
- `PLANNING_BLOCKED`
- `SCHEDULER_LAG`
- `DELIVERY_FAILURE`

Scheduler lag threshold

```text
NOTIFICATION_SCHEDULER_LAG_THRESHOLD_SECONDS=300
```

Alerts resolve automatically after the underlying condition clears and remain as retained operational evidence

## Worker state

The worker stores one durable heartbeat row with

- last cycle start and completion
- last successful cycle
- last error
- planning scanned, ready, committed, and blocked counts
- jobs promoted due
- delivery claims
- current open alert count

The Notification Planning page exposes this state through the Trusted Automation operations card

## Retention

Retention remains fail-closed by default

```text
NOTIFICATION_RETENTION_ENABLED=false
NOTIFICATION_OPERATIONAL_ALERT_RETENTION_DAYS=90
NOTIFICATION_RETENTION_BATCH_SIZE=100
```

When enabled, only resolved operational alerts older than the configured retention period are removed

Existing expired-session cleanup remains independent

Audit events, holiday history, notification jobs, delivery evidence, and unresolved alerts are not deleted by this retention job

## Production deployment

Use `docs/PRODUCTION-DEPLOYMENT-AI-AGENT.md` for the production start order, readiness checks, and release sequence
