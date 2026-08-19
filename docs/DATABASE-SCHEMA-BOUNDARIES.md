# ATI PH Database Schema Boundaries

| Metadata | Value |
| --- | --- |
| Status | Implemented |
| Version | 1.1 |
| Date | 2026-08-19 |

## Principle

ATI PH remains one PostgreSQL database.

PostgreSQL schemas provide bounded-context namespaces and structural ownership boundaries.

They are not independent security boundaries unless separate database roles/grants are introduced later.

`public` remains available for Prisma migration bookkeeping.

Application tables and native enums are assigned to explicit bounded-context schemas.

## Mapping

| Schema | Responsibility | Current tables |
| --- | --- | --- |
| `access` | local session and app authorization | `users`, `auth_sessions`, `roles`, `permissions`, `role_permissions`, `user_roles`, `menus` |
| `governance` | audit, outbox, immutable artifact metadata | `audit_events`, `outbox_events`, `file_artifacts` |
| `import` | governed workbook ingestion and validation | `import_batches`, `import_rows`, `import_validation_issues` |
| `approval` | reusable maker-checker | `approval_requests` |
| `holiday` | canonical holiday and calendar-region registry | `calendar_regions`, `calendar_region_aliases`, `holiday_definitions`, `holiday_occurrences`, `holiday_occurrence_regions`, `holiday_occurrence_dates` |
| `routing` | client and recipient routing | `clients`, `service_teams`, `contacts`, `client_subscriptions`, `subscription_recipients` |
| `notification` | policy, scheduling, durable execution, delivery attempts | `notification_schedule_policies`, `notification_schedule_policy_versions`, `notification_policies`, `notification_policy_versions`, `notification_jobs`, `notification_delivery_attempts` |

## Notification schema evolution

The `notification` schema now owns more than policy configuration.

It includes durable execution state:

```text
NotificationJob
→ schedule snapshot
→ recipient snapshot
→ rule snapshot
→ frozen email content
→ retry state
→ delivery attempts
```

Current job execution states include:

```text
WAITING_APPROVAL
PLANNED
DUE
PROCESSING
RETRY_WAIT
SENT
FAILED
CANCELLED
```

Delivery attempts persist provider identity, provider message ID, claim lease, failure class, and lease-retry safety.

## Invariants

- every application Prisma model and native enum declares `@@schema(...)`
- raw SQL must schema-qualify application tables
- cross-schema Prisma relations are allowed inside the modular monolith
- schema moves of existing data must use reviewed data-preserving DDL
- do not accept drop-and-recreate semantics for a data-preserving schema move
- domain write ownership remains enforced in code modules
- application migrations must remain drift-free against the Prisma datamodel

## Current non-goals

- separate PostgreSQL database per bounded context
- independent DB credentials per module
- row-level security as an application authorization substitute
- microservice extraction
- cross-application shared platform APIs
