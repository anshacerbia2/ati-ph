# ATI PH Access Control

| Metadata | Value |
| --- | --- |
| Status | Active |
| Version | 1.1 |
| Date | 2026-08-19 |
| Scope | ATI PH application authorization |
| Executable catalog | `src/auth/authorization-catalog.ts` |

## 1. Authority boundary

```text
Authentication
→ Keycloak

Application authorization
→ ATI PH PostgreSQL

Role
→ bundle of permissions

Backend enforcement
→ permission checks
```

Keycloak proves identity.

ATI PH owns application roles, permissions, role assignments, and permission-gated menu visibility.

## 2. System roles

| Code | Purpose |
| --- | --- |
| `ADMINISTRATOR` | Full ATI PH administration |
| `OPERATOR` | Operational import, routing read, policy read, planning, and plan commit |
| `APPROVER` | Maker-checker import and notification-plan approval |
| `AUDITOR` | Read-only governed operational visibility |

A user can hold multiple roles.

Maker-checker still compares user identity, so role combinations never allow a user to approve their own request.

## 3. System permissions

### Calendar

- `calendar_region.read`
- `calendar_region.manage`

### Governed import

- `import.read`
- `import.create`
- `import.approve`

### Client routing

- `client.read`
- `client.manage`

### Notification policy

- `notification_policy.read`
- `notification_policy.manage`

### Notification planning

- `notification_plan.read`
- `notification_plan.commit`
- `notification_plan.approve`

## 4. Current role mapping

### ADMINISTRATOR

- all current system permissions

### OPERATOR

- `calendar_region.read`
- `import.read`
- `import.create`
- `client.read`
- `notification_policy.read`
- `notification_plan.read`
- `notification_plan.commit`

### APPROVER

- `calendar_region.read`
- `import.read`
- `import.approve`
- `client.read`
- `notification_policy.read`
- `notification_plan.read`
- `notification_plan.approve`

### AUDITOR

- `calendar_region.read`
- `import.read`
- `client.read`
- `notification_policy.read`
- `notification_plan.read`

The executable mapping in `src/auth/authorization-catalog.ts` is authoritative.

## 5. Maker-checker invariants

### Governed import

- submit requires `import.create`
- decide requires `import.approve`
- requester cannot decide the same request
- approval binds to frozen submitted content hash
- rejection returns the resource to correction/resubmission flow
- canonical publication requires approved frozen content

### Notification plan

- commit requires `notification_plan.commit`
- approval decision requires `notification_plan.approve`
- requester cannot decide the same notification approval
- approval binds to the deterministic frozen job hash
- frozen hash includes recipients, rule/schedule data, automatic-send/retry controls, and exact governed email content
- approval transitions `WAITING_APPROVAL -> PLANNED`
- rejection transitions `WAITING_APPROVAL -> CANCELLED`

## 6. Menu visibility

Current governed menu gates include:

| Menu | Permission |
| --- | --- |
| Operations | `import.read` |
| Imports | `import.read` |
| Notification Planning | `notification_plan.read` |
| Calendar Regions | `calendar_region.read` |
| Client Routing | `client.read` |
| Notification Policies | `notification_policy.read` |

Menu visibility is presentation only.

Every page and Route Handler must independently enforce permission requirements.

## 7. Role assignment

A user must exist locally before role assignment.

For local development, sign in once through Keycloak and then run:

```cmd
npm run authz:grant -- --email user@example.com --role OPERATOR
```

Valid roles:

```text
ADMINISTRATOR
OPERATOR
APPROVER
AUDITOR
```

Role assignment changes ATI PH authorization only.

It does not create or modify Keycloak realm roles.

## 8. Change control

When authorization changes:

1. update `src/auth/authorization-catalog.ts`
2. update server-side permission checks
3. update menu gates if required
4. update this document in the same change
5. update permission tests
6. keep maker-checker identity separation intact
