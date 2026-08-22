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
approved production Keycloak client credential   for client `ph-notif`
SESSION_SECRET
ATI_ONE_PROXY_SECRET
ARTIFACT_STORAGE_DIR
private web bind address/PORT
existing process supervisor or service manager
ATI One proxy/upstream configuration owner
```

Three of those are shared with a deployment this agent does not perform. ATI One's own
`backend/.env` must carry the private address of this app and the same proxy secret, and
its catalogue row is written by its seed rather than by hand:

```text
ATI_ONE_PH_NOTIFICATION_UPSTREAM        http(s) origin, no path, private address
ATI_ONE_PH_NOTIFICATION_PROXY_SECRET    identical to ATI_ONE_PROXY_SECRET here
```

Confirm with the portal's deployment owner that both are set **before** enabling
`TRUST_ATI_ONE_PROXY`. Enabling it first is the ordering that takes the app dark.

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
KEYCLOAK_CLIENT_ID=ph-notif
KEYCLOAK_CLIENT_SECRET=<PRODUCTION_KEYCLOAK_CLIENT_SECRET>
SESSION_SECRET=<PRODUCTION_SESSION_SECRET>

TRUST_ATI_ONE_PROXY=true
ATI_ONE_PROXY_SECRET=<PRODUCTION_PROXY_SECRET>
ATI_ONE_RETURN_URL=https://one.atibusinessgroup.com/

ARTIFACT_STORAGE_DIR=/var/lib/ati-ph/artifacts
```

`KEYCLOAK_CLIENT_ID` is **`ph-notif`**, this application's own client. This line said
`ati-one-portal` — the *portal's* client — and that value is the dangerous kind of wrong,
because it works. Tokens come back and people sign in, and from then on ATI PH issues
sessions under an identity that belongs to another application: every redirect URI this
app needs has to be added to the portal's client, rotating either secret signs out both,
and the realm's own logs cannot tell the two apart afterwards because `azp` says
`ati-one-portal` for each. Verify the client id against `.env.production.example` before
materializing anything.

`NEXT_PUBLIC_APP_BASE_PATH` is a build-time input and must be correct before `npm run verify` / `npm run build`. It is
inlined into the client bundle, so setting it in the deployment platform's environment has
no effect at all — a container started with the right value and built with the wrong one
serves an app whose every asset path is wrong, and the failure looks like a broken proxy.

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

**Both sides or neither.** `ATI_ONE_PROXY_SECRET` in ATI PH's environment must equal
`ATI_ONE_PH_NOTIFICATION_PROXY_SECRET` in the portal's `backend/.env`, which is what the
portal's seed writes onto the catalogue row. That variable belongs in the environment
rather than the admin console because a re-seed rewrites the row's `config` and would undo
a console edit. Set on one side only, the outcomes are not symmetric: set on the portal
and unchecked here is merely pointless, while checked here with nothing sent makes ATI PH
refuse **every** request the portal forwards — the app goes completely dark and the portal
reports it unreachable. Confirm both values before enabling.

The guard covers everything except one path:

```text
/apps/ph-notification/app/api/health/live   served without proof - for the container healthcheck
everything else                             refused without proof, static assets included
```

The exemption exists because the healthcheck runs inside the container and has no secret
to present; without it, turning the guard on marks a healthy container unhealthy. `/health`
and `/ready` read the database and stay behind the guard, so verify those through the
public ATI One route where the proxy supplies the header — not against the private
address, where they will correctly answer `403`.

Reaching the private address directly in a browser answers `403` with a page saying the
app is reachable only through ATI One. That is the guard working, not a misconfiguration.

**ATI PH's own Keycloak client** — `ph-notif`, not the portal's — must allow the exact
mounted callback

```text
https://one.atibusinessgroup.com/apps/ph-notification/app/api/auth/callback/keycloak
```

Do not register the private upstream address as the canonical production browser callback

The portal deployment must also carry the internal-app proxy's `_rsc` key alignment. Without
it an open app page repeats one request pair tens of times a second — reads only, so nothing
breaks and nothing appears in an error log, but it is per open tab and it multiplies by the
number of people who leave one open. See `alignedSearch` in the portal's internal-app route.

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

Also validate one mounted browser login round trip through ATI One and confirm ATI PH
creates its own session cookie

```text
__Secure-ph-notification-app.session     over https, which production always is
```

The name is a contract with the portal, not a local choice. ATI One clears an internal
app's cookies at sign-out by matching `/^(?:__Secure-|__Host-)?([a-z0-9][a-z0-9-]*)-app\./`
against the cookie header — nothing asks the app and there is no registry. This cookie was
called `ati_ph_session`, which does not match that pattern, so ATI PH stayed signed in when
every other application signed out. If a deployment reports the old name, the build is
older than that fix. `__Host-` is illegal here: it forces `Path=/`, and these cookies are
scoped to the mount path.

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
- `AGENTS.md` — the failures that have already cost time here, and how each was proved
- `package.json`
- `next.config.ts`
- `src/config/server-env.ts` — every variable this app reads, and the coherence rules
- `src/config/app.ts` — the single declaration of the mount path
- `src/auth/cookie-names.ts` — the cookie contract with the portal
- `src/auth/oidc.ts` — `browserUrl`: redirects name the browser's address, never this bind
- `src/proxy.ts`
- `src/worker/main.ts`
- `src/email/automatic-delivery-release.ts`
- `docs/PRODUCTION-READINESS.md`
- `docs/SMTP-AUTOMATIC-DELIVERY-RUNBOOK.md`
- `docs/TRUSTED-AUTOMATION-RUNBOOK.md`
- `docs/PRODUCT-ACCEPTANCE-CHECKLIST.md`

If a deployment assumption conflicts with current source, current source wins and the deploy agent must stop and report the conflict rather than silently changing behavior
