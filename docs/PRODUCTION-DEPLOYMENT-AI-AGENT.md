# ATI PH Production Deployment — AI Agent Runbook

## Purpose

This is the authoritative production deployment procedure for an AI agent deploying ATI PH

The deploy agent must deploy an explicitly supplied release SHA, preserve the current fail-closed safety model, and stop rather than infer missing production approvals or infrastructure details

ATI PH production topology is

```text
ATI One public origin
→ /apps/ph-notification/app
→ ATI One internal-app proxy
→ ATI PH Next.js web process

ATI PH worker process
→ PostgreSQL
→ Email Delivery Engine

ATI PH web + worker
→ same PostgreSQL database
```

The web and worker are separate long-running processes from the same repository

## 1. Hard rules for the deploy agent

- Deploy only an explicitly supplied release SHA
- Do not deploy an implicit moving branch head
- Do not modify source code during deployment
- Do not run `prisma migrate reset`
- Do not run `prisma migrate dev` in production
- Do not run the seed on an existing production database unless the operator explicitly authorizes it
- Do not print, commit, log, or paste production secrets
- Do not enable automatic SMTP merely because SMTP connectivity works
- Do not enable automatic provider fallback because none exists
- Do not retry `OUTCOME_UNKNOWN` delivery automatically
- Do not start the worker before database migrations are complete
- Stop deployment when a required external value or approval is missing instead of inventing one

## 2. Required deployment inputs

The deploy agent must receive these values from the deployment owner before starting

```text
RELEASE_SHA
production repository/worktree path
production PostgreSQL connection
approved production Keycloak client credential
SESSION_SECRET
ATI_ONE_PROXY_SECRET
ARTIFACT_STORAGE_DIR
private web bind address/PORT
existing process supervisor or service manager
ATI One proxy/upstream configuration owner
```

For production SMTP activation, the agent additionally requires explicit evidence that all production email gates are approved

```text
ATI IT-approved SMTP route
approved SMTP secret-management path
authorized client-recipient scope
monitoring/runbook owner
business owner acceptance
EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED=true authorization
```

If these email approvals are not supplied, deploy the application with automatic SMTP closed

## 3. Checkout the exact release

From the production worktree

```cmd
git fetch origin
git checkout <RELEASE_SHA>
git rev-parse HEAD
git status --short
```

The returned SHA must exactly equal the supplied release SHA

The working tree must be clean before build or migration

Do not merge, rebase, or pull unrelated changes during a release execution

## 4. Install dependencies

Use the repository lockfile

```cmd
npm ci
```

Required runtime baseline is Node.js 20.19 or newer

Do not regenerate or replace the lockfile during deployment

## 5. Materialize production environment

`.env.production.example` is a sanitized reference only. It is one of three complete
profiles — see [`ENVIRONMENT-PROFILES.md`](./ENVIRONMENT-PROFILES.md) — and unlike the
local and test profiles it ships with the delivery gates in the open position, because
that is what production means. Those four lines are not a default to inherit: deploy
them closed until the release evidence in §9 of `LOCAL-EMAIL-TESTING.md` exists. The
application runs fully and does not send, which is a deliberate operating state.

Two variables in that profile are worth naming here because they change what an operator
can do without a release:

```text
NOTIFICATION_WORKER_ENABLED        the worker refuses to start when false
EMAIL_DELIVERY_KILL_SWITCH_PATH    `touch` that file to halt delivery next cycle
```

The actual production runtime currently expects its environment to be available to both the web process and worker. The repository readiness command loads `.env`, so when the deployment platform does not inject environment variables directly into that command, materialize a protected gitignored `.env` from the approved secret source

Minimum application production values include

```env
NODE_ENV=production
NEXT_PUBLIC_APP_BASE_PATH=/apps/ph-notification/app
PUBLIC_APP_URL=https://one.atibusinessgroup.com/apps/ph-notification/app
OIDC_CALLBACK_URL=https://one.atibusinessgroup.com/apps/ph-notification/app/api/auth/callback/keycloak

DATABASE_URL=<PRODUCTION_DATABASE_URL>
KEYCLOAK_ISSUER=https://one.atibusinessgroup.com/auth/realms/ati-one
KEYCLOAK_CLIENT_ID=ati-one-portal
KEYCLOAK_CLIENT_SECRET=<PRODUCTION_KEYCLOAK_CLIENT_SECRET>
SESSION_SECRET=<PRODUCTION_SESSION_SECRET>

TRUST_ATI_ONE_PROXY=true
ATI_ONE_PROXY_SECRET=<PRODUCTION_PROXY_SECRET>
ATI_ONE_RETURN_URL=https://one.atibusinessgroup.com/

ARTIFACT_STORAGE_DIR=/var/lib/ati-ph/artifacts
```

`NEXT_PUBLIC_APP_BASE_PATH` is a build-time input and must be correct before `npm run verify` / `npm run build`

The artifact directory must exist on durable protected storage and be writable by the ATI PH runtime identity

### Safe first-deploy automation state

Unless the release owner explicitly provides later activation approval, keep

```env
NOTIFICATION_TRUSTED_AUTOMATION_ENABLED=false
NOTIFICATION_RETENTION_ENABLED=false

EMAIL_DELIVERY_MODE=DISABLED
EMAIL_SMTP_TEST_ENABLED=false
EMAIL_SMTP_PILOT_ENABLED=false
EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED=false
EMAIL_DELIVERY_KILL_SWITCH=true
EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED=false
```

This permits application deployment without authorizing external email delivery

## 6. Validate the release before database mutation

Run the complete repository gate

```cmd
npm run verify
```

This must pass typecheck, tests, lint, Prisma client generation, and production build

Then run production configuration readiness with `NODE_ENV=production` in the environment

```cmd
npm run ops:production-readiness
```

`applicationReady` must be `true`

`externalDeliveryReady` may remain `false` when outbound SMTP is intentionally not activated

Do not turn on SMTP flags just to make the readiness output look green

## 7. Protect and migrate PostgreSQL

Before migration, obtain the production database backup/snapshot reference from the database owner

Then apply committed migrations only

```cmd
npx prisma migrate deploy
```

Validate schema drift

```cmd
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
```

Expected result

```text
No difference detected.
```

Never use `prisma migrate reset` in production

### Seed rule

`npm run db:seed` is not a normal deployment step

The seed contains authorization bootstrap, region bootstrap, and client-routing seed data. Run it only for an explicitly approved first-time production bootstrap or an explicitly approved controlled reseed

Do not run it automatically on upgrades

## 8. Configure ATI One proxy and Keycloak

The public production entry point is exactly

```text
https://one.atibusinessgroup.com/apps/ph-notification/app
```

The ATI One proxy must

- route the mounted path to the private ATI PH web process
- preserve the mounted application path expected by Next.js `basePath`
- send `x-ati-one-proxy` with the exact shared proxy secret
- prevent the private ATI PH origin from becoming a normal browser entry point

With `TRUST_ATI_ONE_PROXY=true`, application requests that reach ATI PH without the correct `x-ati-one-proxy` proof are rejected

This includes health routes because the current `src/proxy.ts` matcher protects all non-static application requests

The shared Keycloak client must allow the exact mounted callback

```text
https://one.atibusinessgroup.com/apps/ph-notification/app/api/auth/callback/keycloak
```

Do not register the private upstream address as the canonical production browser callback

## 9. Start the web process

Use the existing production process supervisor/service manager

Repository command

```cmd
npm start
```

The supervisor must provide the production environment and private bind `PORT`

Do not expose the web process directly to end users

The repository uses Next.js standalone output, but the package-level runtime contract is `npm start`. Do not invent a different runtime entry point unless infrastructure ownership explicitly standardizes one

## 10. Start the worker process

Only after successful migration and web startup

```cmd
npm run worker
```

Run it as a separate supervised long-running process with the same production database and relevant runtime environment

The worker owns

- expired session cleanup
- trusted-planning scan and optional auto-commit
- scheduler `PLANNED -> DUE`
- expired delivery-lease recovery
- `RETRY_WAIT -> DUE` promotion
- STREAM or explicitly released SMTP delivery execution
- scheduler-lag and delivery-failure alert synchronization
- worker heartbeat
- optional resolved-alert retention

When trusted automation is disabled, planning remains shadow-only

When email delivery is disabled or SMTP release controls are closed, the worker does not perform automatic external SMTP sends

## 11. Production health verification

Verify through the public ATI One route so proxy proof behavior is included

```text
https://one.atibusinessgroup.com/apps/ph-notification/app/api/health/live
https://one.atibusinessgroup.com/apps/ph-notification/app/api/health
https://one.atibusinessgroup.com/apps/ph-notification/app/api/health/ready
```

Expected roles

```text
/live
→ process liveness

/health
→ server configuration + PostgreSQL connectivity

/ready
→ production config + database + trusted-worker heartbeat when required + SMTP release state
```

If trusted automation is enabled, `/ready` requires a fresh successful worker heartbeat

Also validate one mounted browser login round trip through ATI One and confirm ATI PH creates its own `ati_ph_session`

## 12. Trusted automation activation

This is a separate operational release decision from application deployment

Only after the operational owner approves automatic plan commitment

```env
NOTIFICATION_TRUSTED_AUTOMATION_ENABLED=true
```

Restart or reload the worker through the process supervisor

Then verify

- `/api/health/ready` remains READY through the mounted public URL
- worker heartbeat updates
- planning scans are visible in Notification Planning
- zero-recipient and planning-blocked conditions appear as operational alerts

Enabling trusted automation does not enable SMTP delivery

## 13. Production SMTP activation

Automatic production SMTP requires every release control to permit execution

```env
EMAIL_DELIVERY_MODE=SMTP
EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED=true
EMAIL_DELIVERY_KILL_SWITCH=false
EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED=true
```

Also configure the ATI IT-approved SMTP host, sender, TLS settings, and credential mechanism

When `NODE_ENV=production`, missing `EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED=true` blocks automatic SMTP even if the other flags are open

Before worker restart, run

```cmd
npm run ops:production-readiness
```

Confirm the external-delivery section has no release blocker

Then restart the worker and monitor the first controlled production delivery closely

No automatic provider fallback is allowed

## 14. Emergency email stop

Fastest runtime stop when a kill-switch file path is configured

```text
create the file at EMAIL_DELIVERY_KILL_SWITCH_PATH
```

The worker stops making new SMTP claims on the next polling cycle

The static environment stop is

```env
EMAIL_DELIVERY_KILL_SWITCH=true
```

An environment change requires the normal process reload/restart mechanism

The kill switch does not rewrite already completed delivery evidence and does not make an ambiguous SMTP outcome safe to retry

## 15. Rollback

### Application problem before external delivery

- stop/revert the affected web or worker release through the existing supervisor
- keep the database intact
- do not automatically reverse Prisma migrations
- verify schema compatibility before running an older application build

### Email problem

- activate the email kill switch first
- stop new SMTP claims
- preserve all `NotificationDeliveryAttempt` evidence
- reconcile `OUTCOME_UNKNOWN` attempts before any manual resend
- do not switch providers automatically

Database rollback is an explicit database-owner procedure, not an automatic deploy-agent action

## 16. Deployment completion evidence

The deploy agent must return a sanitized deployment report containing

- deployed release SHA
- Node.js and npm versions
- `npm ci` result
- `npm run verify` result
- production-readiness result without secrets
- database backup/snapshot reference
- `prisma migrate deploy` result
- Prisma drift result
- web process status
- worker process status
- public `/live`, `/health`, and `/ready` results
- ATI One mounted-login result
- trusted-automation enabled/disabled state
- automatic SMTP enabled/disabled state
- kill-switch state
- production SMTP approval state
- any open production activation gates

Never include raw secret values in the deployment report

## 17. Source references

The deploy agent must treat source code and these documents as the current execution contract

- `.env.production.example`
- `package.json`
- `next.config.ts`
- `src/config/server-env.ts`
- `src/proxy.ts`
- `src/worker/main.ts`
- `src/email/automatic-delivery-release.ts`
- `docs/PRODUCTION-READINESS.md`
- `docs/SMTP-AUTOMATIC-DELIVERY-RUNBOOK.md`
- `docs/TRUSTED-AUTOMATION-RUNBOOK.md`
- `docs/PRODUCT-ACCEPTANCE-CHECKLIST.md`

If a deployment assumption conflicts with current source, current source wins and the deploy agent must stop and report the conflict rather than silently changing behavior
