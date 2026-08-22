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

### Users

- `user.read`
- `user.manage`

Split, because seeing who has access and deciding it are different jobs. An auditor asked
to confirm that nobody outside operations can approve a notification plan needs the first
and must not be given the second — and without `user.read` they would have to ask the
person they are auditing.

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
- `user.read`

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
| Deliveries | `notification_plan.read` |
| Users | `user.read` |

Menu visibility is presentation only.

Every page and Route Handler must independently enforce permission requirements.

## 7. Role assignment

A user must exist locally before role assignment, and a user exists locally because they
signed in. There is no invite: the realm decides who may authenticate, this database
decides what they may do, and adding a person here before they have ever arrived would
make ATI PH a second place where accounts are created.

### The screen

**Administration → Users**, at `/admin/users`. It lists everyone who has signed in with
the roles they hold, and it is the normal way to grant and revoke. It requires
`user.read` to see and `user.manage` to change.

Two things on it are worth explaining, because both look like clutter until they matter:

**Active sessions** are shown because revoking a role does not end a session. It changes
what the *next* request may do; a page already open keeps what it has rendered. During an
incident that is a different question from what the role table says, and the answer to
"are they still in there" is the session count.

**Deactivate** is not a stronger revoke. Revoking asks "should they still be able to
approve"; deactivating asks "should they still be able to get in". An inactive user's
session is revoked on their next request by `resolveFreshSession`, so it does not wait for
anyone to notice. Nobody can deactivate their own account: it would end the session
needed to undo it.

The last `ADMINISTRATOR` cannot be revoked. The screen that grants roles requires the
role being removed, so the estate would need a database edit or a restart with
`BOOTSTRAP_ADMINISTRATOR_EMAIL` to recover — during whatever caused it. Grant the role to
somebody else first.

### The way in to an empty database

A fresh database has roles and permissions but nobody holding them, so the first person to
sign in is refused every screen including this one. `BOOTSTRAP_ADMINISTRATOR_EMAIL` names
one address that becomes `ADMINISTRATOR` on sign-in, **and only while it holds no role at
all**. Unset means nobody.

Every grant is written to the audit trail as `AUTH_BOOTSTRAP_ROLE_GRANTED`, carrying the
address that matched and the variable as the reason, so a role nobody granted is still
answerable a year later.

⚠ **Clear the variable once a human administrator exists.** While it is set that account
cannot be demoted — strip its last role and the next sign-in grants `ADMINISTRATOR` again,
because from the application's side that is indistinguishable from a first sign-in.

### The command line

Still available, and the right tool when there is no browser:

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
