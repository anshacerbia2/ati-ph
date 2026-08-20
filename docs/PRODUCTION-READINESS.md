# ATI PH Production Readiness

## Software state

The ATI PH software path supports governed import, canonical publication, client routing, frozen notification planning, maker-checker approval, trusted automation, controlled delivery, retry/recovery, ambiguous-outcome reconciliation, correction/replanning, operational alerts, audit visibility, health endpoints, and retention controls

Software completion does not automatically authorize production external email delivery

## Health endpoints

```text
GET /api/health/live
GET /api/health
GET /api/health/ready
```

`/api/health/live` proves process liveness

`/api/health` proves application configuration parsing and database connectivity

`/api/health/ready` additionally reports

- trusted-automation worker heartbeat when automation is enabled
- production configuration blockers
- SMTP automatic-release state
- kill-switch state
- production external-delivery approval state

## Production automatic SMTP gate

Production automatic SMTP requires all code gates to agree

```text
EMAIL_DELIVERY_MODE=SMTP
EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED=true
EMAIL_DELIVERY_KILL_SWITCH=false
EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED=true
```

If `NODE_ENV=production`, the final production release flag is mandatory

The runtime kill-switch file still overrides release when `EMAIL_DELIVERY_KILL_SWITCH_PATH` exists

No automatic provider fallback is implemented

## External approval evidence required before setting the production release flag

- ATI IT approves the production SMTP relay or route
- production credentials are stored in the approved secret-management path
- actual external/client recipient scope is authorized
- monitoring and runbook ownership are assigned
- controlled production/client-recipient pilot is accepted where required
- Operations confirms whether a governed attachment is required
- business owner accepts production behavior

These approvals are external release gates, not missing software features

## Trusted automation

```text
NOTIFICATION_TRUSTED_AUTOMATION_ENABLED=false
```

Default behavior is shadow-only

Enable trusted automation only after the operational owner accepts automatic plan commitment

Enabling trusted automation does not enable SMTP delivery

## Retention

```text
NOTIFICATION_RETENTION_ENABLED=false
```

Retention stays disabled until retention ownership and duration are approved

The implemented retention job only deletes old resolved operational alerts

It does not delete audit events, holiday history, notification jobs, delivery evidence, or unresolved alerts

## Command-line readiness report

```cmd
npm run ops:production-readiness
```

The command returns a non-zero exit code when application-level production configuration blockers exist

A closed external-delivery gate is reported separately so the application can be production-ready while outbound email remains intentionally disabled
