# ATI PH Database Schema Boundaries

## Status

Implemented bounded-context namespace baseline

## Principle

ATI PH remains one PostgreSQL database. PostgreSQL schemas provide domain namespaces and structural ownership boundaries. They do not replace code-module boundaries and they are not an independent security boundary unless separate database roles and grants are introduced later.

`public` remains available for Prisma migration bookkeeping. Application tables and native enums are assigned to explicit bounded-context schemas.

## Mapping

| Schema | Responsibility | Tables |
| --- | --- | --- |
| `access` | Local ATI PH identity/session and application authorization | `users`, `auth_sessions`, `roles`, `permissions`, `role_permissions`, `user_roles`, `menus` |
| `governance` | Audit, outbox, immutable artifact metadata | `audit_events`, `outbox_events`, `file_artifacts` |
| `import` | Governed workbook ingestion and validation staging | `import_batches`, `import_rows`, `import_validation_issues` |
| `approval` | Reusable maker-checker records | `approval_requests` |
| `holiday` | Canonical public-holiday calendar and region registry | `calendar_regions`, `calendar_region_aliases`, `holiday_definitions`, `holiday_occurrences`, `holiday_occurrence_regions`, `holiday_occurrence_dates` |
| `routing` | Client, service-team, subscription, contact, and recipient configuration | `clients`, `service_teams`, `contacts`, `client_subscriptions`, `subscription_recipients` |
| `notification` | Notification policy and policy versioning | `notification_policies`, `notification_policy_versions` |

## Invariants

- Every application Prisma model and native enum declares `@@schema(...)`
- Cross-schema Prisma relations remain explicit and are allowed inside this modular monolith
- Active raw SQL must schema-qualify application tables
- Moving an existing model between PostgreSQL schemas must use reviewed data-preserving DDL such as `ALTER TABLE ... SET SCHEMA`
- Do not accept Prisma's default drop-and-recreate behavior for an existing table or enum schema move
- Database schemas are secondary hardening; domain write ownership remains enforced in application modules
- A future separate database, service, or DB-role boundary requires an explicit architecture decision and operational justification

## Current non-goals

- Separate PostgreSQL databases per bounded context
- Independent database credentials per module
- Row-level security
- Service extraction
- Cross-application shared platform APIs
