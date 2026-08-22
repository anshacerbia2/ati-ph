# ATI PH Environment Profiles

| Metadata | Value |
| --- | --- |
| Status | Active |
| Version | 1.0 |
| Date | 2026-08-21 |
| Scope | Every environment variable ATI PH reads, and which profile may do what |
| Declaration | `src/config/server-env.ts` |
| Enforced by | `src/config/__tests__/env-profile-coherence.test.ts`, `src/email/__tests__/email-docs-contract.test.ts` |

## The rule

**`.env` is the source of truth. Reading it tells you what the process will do.**

That is a property the codebase now has and did not before. Three things were in the
way, and all three are fixed:

1. **Variables that existed only in code.** `EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED`,
   `EMAIL_DELIVERY_KILL_SWITCH` and `EMAIL_DELIVERY_KILL_SWITCH_PATH` decide whether
   real email leaves the building, and appeared in no schema and no example. There was
   no way to learn they existed by reading configuration.
2. **A state with no variable.** "The worker is disabled" was expressed by not running
   it. Nothing in any file said so, so the only way to know was to look at what was
   running. That is now `NOTIFICATION_WORKER_ENABLED`.
3. **One example for every environment.** Alternatives sat commented out beside each
   other, so a reader had to decide which lines applied to them before trusting any of
   them. Reading configuration should not require judgement.

## The three profiles

Each is a complete file. Every variable is written out, including the ones whose value
equals the code default — so no behaviour is hidden in a default you would have to open
`server-env.ts` to discover.

| | `.env.local.example` | `.env.test.example` | `.env.production.example` |
| --- | --- | --- | --- |
| For | your machine | shared test | production |
| `NODE_ENV` | `development` | `test` | `production` |
| Email path | manual connectivity test | controlled pilot | **automatic** |
| `EMAIL_DELIVERY_MODE` | `SMTP` | `SMTP` | `SMTP` |
| `EMAIL_SMTP_TEST_ENABLED` | **`true`** | `false` | `false` |
| `EMAIL_SMTP_PILOT_ENABLED` | `false` | **`true`** | `false` |
| `EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED` | `false` | `false` | **`true`** |
| `EMAIL_DELIVERY_KILL_SWITCH` | `true` | `true` | **`false`** |
| `NOTIFICATION_WORKER_ENABLED` | **`false`** | `true` | `true` |
| `NOTIFICATION_TRUSTED_AUTOMATION_ENABLED` | `false` | `true` | `true` |
| Can it email a client? | no | no | **yes** |

`.env.example` holds no variables at all. It is an index that names the three and says
to copy one — and a test asserts it stays that way, because a variable creeping back in
is how one file starts serving every environment again.

### Running mounted needs `allowedDevOrigins`

This one cost most of an afternoon, and it is one line.

Next blocks cross-origin requests to **dev-only** assets and endpoints by default. Mounted
in ATI One, the browser asks for this app's dev assets from the *portal's* address while
this dev server was initialised on its own — so every chunk, every stylesheet and the HMR
socket arrives cross-origin and is refused.

```ts
// next.config.ts — the portal's origin, taken from DEV_APP_ORIGIN
allowedDevOrigins: [new URL(devOrigin).host],
```

Production builds ignore it, so it cannot widen anything that ships.

**Why it was so hard to read.** One cause produced three unrelated-looking symptoms:

```text
chunks 404          -> ChunkLoadError -> client components never hydrate
HMR client thrashes -> remounts       -> AbortController cancels every fetch
                                      -> skeletons spin forever, and no error appears,
                                         because an aborted load deliberately sets nothing
```

Server-rendered pages were unaffected throughout, so the app looked half-working: Imports
showed its data while Client Routing reported zero clients against a database holding
fifty-one. If you ever see that shape again — server pages fine, client fetches silent —
check this before anything else.

The HMR socket still cannot work: it addresses the portal, and an HTTP route handler
cannot carry a WebSocket upgrade. Its client then retries forever, which is why running
mounted is done with `npm run build && npm start` — a production build carries no HMR
client at all, so nothing retries. The cost is one build per change; `next dev` mounted
trades that for a permanent reconnect loop.

### Two failures that belong to the portal, not to this app

Both were chased here first and neither is fixable here. If you meet them, say so to the
ATI One team rather than changing anything in this repository.

**Sign-out appears to do nothing, locally only.** The portal's sign-out is a form POST
whose redirect chain ends at Keycloak, and Chrome applies `form-action` to every hop of
that chain. In production the realm is served under the portal's own hostname and `'self'`
covers it; on localhost the two are different origins and the submission never leaves the
browser — nothing reaches any server, the cookie survives, and the button looks inert. The
portal needs `DEV_REALM_ORIGIN` set; the same variable is why the frame works at all.

**One path repeats `307`/`200` tens of times a second.** Next's `_rsc` cache key is a hash
of four routing headers, and a client can hash a header set it then does not send — this
app answers `307` to the corrected URL, the router re-issues the original, and the pair
repeats for as long as the tab is open. The portal's proxy realigns the key now. It reads
only and breaks nothing, which is exactly what makes it hard: every request succeeds, and
the only evidence is volume. `AGENTS.md` records the seven explanations that were wrong
before this one was right.

### Local — why the worker is off

The one profile that runs against a database somebody is editing. A worker there claims
jobs, promotes schedules and mutates durable delivery state without being asked. Turn it
on for a specific test and turn it off again.

`EMAIL_DELIVERY_MODE=SMTP` here is the transport, not permission to send. What the
profile permits is one command:

```cmd
npm run email:smtp:test -- --send
```

It proves credentials, TLS, host and sender identity against one same-domain internal
mailbox. It touches no `NotificationJob` and needs no worker.

### Test — why the worker runs but delivers nothing

Everything the worker does *except* SMTP execution is worth exercising continuously:
planning, scheduling, lease recovery, retry promotion, operational alerts, retention.
This profile runs all of it against real data and still cannot deliver, because the
delivery gates are shut.

Delivery here is a command, not something the worker does:

```cmd
npm run notification:smtp:pilot -- --job <uuid> --send
```

It takes a job's frozen content, verifies its SHA-256, overrides `TO` to one internal
address, clears `CC`, sends through the real transport, and mutates no job state.

**A passing pilot is evidence for opening production. It is not the act of opening it.**

### Production — the only profile that sends

Three lines have to agree, and any one of them in the other position stops delivery:

```env
EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED=true
EMAIL_DELIVERY_KILL_SWITCH=false
EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED=true    # only checked when NODE_ENV=production
```

The example ships them open, because that is what the word production means. They are
not a default to inherit: `EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED` records a human
decision, and the evidence it stands for is listed in
[`LOCAL-EMAIL-TESTING.md` §9](./LOCAL-EMAIL-TESTING.md) and
[`SMTP-AUTOMATIC-DELIVERY-RUNBOOK.md`](./SMTP-AUTOMATIC-DELIVERY-RUNBOOK.md).

Until that evidence exists, deploy this profile with those four lines in the closed
position shown in `.env.test.example`. The application runs fully and does not send.
That is a deliberate, reversible operating state — not a broken deployment.

#### `EMAIL_DELIVERY_KILL_SWITCH_PATH`

The operational stop. Point it at a path on a writable volume, and `touch` that file to
halt delivery on the next worker cycle — no deploy, no restart, no edit to `.env`.
Leave it configured and absent. During an incident you want one action, not a release.

## Two gates, and which one wins

Both must be true for a message to leave. They answer different questions, and neither
substitutes for the other.

```text
env    -> may this deployment send at all, right now?      operational capability
data   -> was this notification authorised to go unattended?   governance fact
```

Evaluation order decides what happens when they disagree:

```text
worker/main.ts   resolveEmailAutomaticDeliveryRelease()
                 if (canExecuteSmtpAutomatically) {          <- env, checked first
                     claimDueNotificationJobs(...)
                 }

delivery.ts      WHERE status='DUE' AND automaticSendAllowed = TRUE   <- per job
```

- **Env closed** → jobs are never claimed. The per-job flag is never consulted. The kill
  switch wins absolutely, which is the whole point of having one.
- **Env open, job not authorised** → the job is skipped. Env cannot force an
  unauthorised notification out.

`automaticSendAllowed` is a snapshot, not a setting. It is frozen onto the job at commit
time next to the recipients, the rules, the rendered content and its SHA-256 — so the
record answers "was this send authorised?" by itself. An environment variable would
leave no trace in the data, could not differ per client, and would retroactively change
the meaning of jobs approved months earlier under a different regime.

Today `notificationPolicySchema` refuses to set it at all — *"Automatic send cannot be
enabled before the controlled delivery phase"* — so the only row that carries it is the
seeded delivery-test routing. See
[`LOCAL-EMAIL-TESTING.md` §7.2](./LOCAL-EMAIL-TESTING.md).

## Refusals

Some combinations start and then behave as though a flag the operator set were not set.
That is the configuration bug that costs the most to find: nothing fails, and the log
agrees with neither reading. `serverEnvSchema` refuses them at boot and names the
contradiction.

| Combination | Why it is refused |
| --- | --- |
| automatic delivery armed with `EMAIL_DELIVERY_MODE` ≠ `SMTP` | only SMTP executes; the flag reads as enabled and sends nothing |
| `EMAIL_SMTP_TEST_ENABLED` and `EMAIL_SMTP_PILOT_ENABLED` both true | two validations, two recipients — a profile has to say which |
| automatic delivery plus either manual command | both send as the same sender through the same transport, so a message in the inbox no longer says which path produced it |
| automatic delivery with `NOTIFICATION_WORKER_ENABLED=false` | the worker is the only executor; armed without it, the profile describes an intent the deployment cannot carry out |
| `EMAIL_DELIVERY_MODE=SMTP` without `EMAIL_SMTP_HOST` | a transport with nowhere to connect |
| `EMAIL_SMTP_USER` without `EMAIL_SMTP_PASSWORD`, or the reverse | half a credential authenticates as nothing |
| an enable flag true without its recipient | a command that would refuse itself later, for a reason the file could have stated |

Boot-time refusals rather than warnings, on purpose. A warning about email delivery is a
line in a log nobody is watching at the moment it matters.

## Defaults close, and one closes upward

Every gate defaults to its closed position. Note the asymmetry, because it is the kind
of thing a reader assumes away:

```text
EMAIL_DELIVERY_MODE                    DISABLED
EMAIL_SMTP_TEST_ENABLED                false
EMAIL_SMTP_PILOT_ENABLED               false
EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED  false
EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED false
NOTIFICATION_WORKER_ENABLED            false
EMAIL_DELIVERY_KILL_SWITCH             true     <- closes by being TRUE
```

A test asserts all seven, so the asymmetry cannot be quietly normalised.

## Values with no default, on purpose

| Variable | Why |
| --- | --- |
| `ATI_ONE_RETURN_URL` | defaulted to `http://localhost:3000/`. A production process that forgot it sent people to a loopback address on their own machine, which reads as a broken link rather than a missing setting. |
| `PUBLIC_APP_URL`, `OIDC_CALLBACK_URL` | must be the address the **browser** uses, prefix and all — never the address the process binds. Keycloak compares the callback character for character and, on a mismatch, says only `Invalid parameter: redirect_uri`. |
| `DATABASE_URL`, `KEYCLOAK_*`, `SESSION_SECRET` | no safe guess exists |

`NEXT_PUBLIC_APP_BASE_PATH` keeps a default, and it is declared once — `DEFAULT_APP_BASE_PATH`
in `src/config/app.ts`. That literal used to sit in three files that were free to
disagree, and did: a callback URL without the prefix silently dropped the cookie `Path`
to `/`. Empty is a legitimate value meaning "served at the origin root", so the fallback
is `??` and not `||`.

## Where the parsing happens

Three modules read environment values, and each brought its own boolean rule — one
throws on a value that is neither `true` nor `false`, another silently reads
anything-but-`true` as false.

```text
src/config/server-env.ts                declares and validates everything
src/email/automatic-delivery-release.ts  decides whether SMTP may execute
src/operations/production-readiness.ts   reports whether production is deployable
```

The latter two keep taking an injected record, because pure and independently testable
is worth more than one fewer parser. The disagreement is now unreachable rather than
merely unlikely: every one of these variables is declared in the schema as
`z.enum(["true", "false"])`, so nothing illegal survives the boundary to reach them.

## Changing a profile

1. Edit the example, not just your `.env`. An undocumented local workaround is the next
   person's afternoon.
2. `npm run verify:fast`. Every example profile is parsed against the real schema, so an
   example that drifts fails there rather than on somebody's machine.
3. Update the table at the top of this file if the posture changed.
