# ATI PH Access Control

| Metadata | Value |
| --- | --- |
| Status | Active |
| Version | 1.0 |
| Date | 2026-08-17 |
| Scope | ATI PH application authorization |
| Executable catalog | `src/auth/authorization-catalog.ts` |

## 1. Authority Boundary

ATI PH separates authentication from application authorization

```text
Authentication
→ Keycloak

Application authorization
→ ATI PH PostgreSQL

Role
→ bundle of permissions

Backend enforcement
→ permission checks, not role-name checks
```

Keycloak is the identity and authentication authority. ATI PH does not derive business authorization from Keycloak realm roles

ATI PH owns application roles, permissions, role assignments, permission assignments, and permission-gated menu visibility in PostgreSQL

The executable role and permission catalog is `src/auth/authorization-catalog.ts`. This document explains that contract for operators, reviewers, and maintainers

## 2. System Roles

| Code | Name | Purpose |
| --- | --- | --- |
| `ADMINISTRATOR` | Administrator | Full ATI PH application administration |
| `OPERATOR` | Operator | Operational import and review activities |
| `APPROVER` | Approver | Maker-checker approval activities |
| `AUDITOR` | Auditor | Read-only operational and audit visibility |

A user may hold more than one ATI PH role. Effective access is the union of permissions granted by the user's active roles

## 3. System Permissions

| Permission | Name | Current capability |
| --- | --- | --- |
| `calendar_region.read` | Read calendar regions | View calendar regions and aliases |
| `calendar_region.manage` | Manage calendar regions | Create and update calendar regions and aliases |
| `import.read` | Read imports | View governed import batches, staging, validation evidence, reports, and registered source evidence |
| `import.create` | Create imports | Upload governed workbooks, create imports, correct staging where allowed, acknowledge warnings, and submit an eligible batch for approval |
| `import.approve` | Approve imports | Approve or reject submitted imports and publish approved canonical holiday data |

## 4. Role-Permission Matrix

| Role | Region Read | Region Manage | Import Read | Import Create | Import Approve |
| --- | --- | --- | --- | --- | --- |
| Administrator | Yes | Yes | Yes | Yes | Yes |
| Operator | Yes | No | Yes | Yes | No |
| Approver | Yes | No | Yes | No | Yes |
| Auditor | Yes | No | Yes | No | No |

Canonical code mapping:

```text
ADMINISTRATOR
→ calendar_region.read
→ calendar_region.manage
→ import.read
→ import.create
→ import.approve

OPERATOR
→ calendar_region.read
→ import.read
→ import.create

APPROVER
→ calendar_region.read
→ import.read
→ import.approve

AUDITOR
→ calendar_region.read
→ import.read
```

## 5. Maker-Checker Invariants

For governed import approval:

- Submission requires `import.create`
- Approval and rejection require `import.approve`
- The user who requested approval cannot decide the same approval request
- Approval applies only to the frozen submitted content hash
- A rejected batch is unfrozen for correction and resubmission
- An approved batch remains frozen for canonical publication
- Canonical publication currently requires `import.approve`

Role combinations do not bypass maker-checker identity separation. A user who has both `import.create` and `import.approve` still cannot approve their own request

## 6. Menu Visibility and Enforcement

Menu visibility is permission-driven presentation only

Current menu gates include:

| Menu | Required permission |
| --- | --- |
| Operations | `import.read` |
| Imports | `import.read` |
| Administration | `calendar_region.read` |
| Calendar Regions | `calendar_region.read` |

Hiding a menu never replaces server-side authorization. Pages and Route Handlers must enforce the required permission independently

## 7. Role Assignment

A user must exist in ATI PH before a local role can be assigned. In local development this normally means the user has logged in at least once

Grant a system role with:

```bash
npm run authz:grant -- --email user@example.com --role APPROVER
```

Use one of:

```text
ADMINISTRATOR
OPERATOR
APPROVER
AUDITOR
```

Role assignment changes ATI PH authorization only. It does not create or modify Keycloak realm roles

## 8. Change Control

When changing access control:

1. Update `src/auth/authorization-catalog.ts`
2. Update server-side permission enforcement where capability boundaries change
3. Update this document in the same change
4. Update tests that assert role or permission behavior
5. Verify menu visibility remains presentation-only and cannot bypass backend checks

Do not hardcode business authorization against role names when a permission check can express the capability boundary
