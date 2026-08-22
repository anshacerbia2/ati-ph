<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## ATI PH — working rules

This application emails real clients on a schedule nobody watches. Most of what looks
like over-engineering here is a control that already caught something. Before removing
one, find out what.

## Read these first

| Question | Document |
| --- | --- |
| Which environment am I in, and what may it do? | [`docs/ENVIRONMENT-PROFILES.md`](docs/ENVIRONMENT-PROFILES.md) |
| How is email validated without sending to a client? | [`docs/LOCAL-EMAIL-TESTING.md`](docs/LOCAL-EMAIL-TESTING.md) |
| Who may do what? | [`docs/ACCESS-CONTROL.md`](docs/ACCESS-CONTROL.md) |
| What does the workbook contract accept? | [`docs/GOVERNED-IMPORT-CONTRACT.md`](docs/GOVERNED-IMPORT-CONTRACT.md) |
| Why is the system shaped this way? | [`architecture.md`](architecture.md) |
| What is deliberately not built yet? | [`plan.md`](plan.md) |
| **How do I deploy this to production?** | [`docs/PRODUCTION-DEPLOYMENT-AI-AGENT.md`](docs/PRODUCTION-DEPLOYMENT-AI-AGENT.md) |

That last one is the procedure, written for an agent that has never seen this repository.
Read it end to end before touching a production host: it stops at every value it cannot
know rather than inferring one, and the ordering in it is load-bearing — enabling the
proxy guard before the portal holds the matching secret takes the application dark.

## The rule that matters most

**Nothing sends email unless four independent things agree.** Two are environment, two
are data:

```text
EMAIL_SMTP_AUTOMATIC_DELIVERY_ENABLED = true    env, default false
EMAIL_DELIVERY_KILL_SWITCH            = false   env, default TRUE
job.automaticSendAllowed              = true    per job, frozen at commit
job.status                            = DUE     per job
```

Evaluation order is deliberate: the env gate is checked in `worker/main.ts` **before**
any job is claimed, so a closed kill switch means the per-job flag is never consulted.
`policy.ts` refuses to set `automaticSendAllowed` at all — *"Automatic send cannot be
enabled before the controlled delivery phase"* — and that refusal stays until the
controlled delivery phase is opened deliberately.

If a change of yours would let a message out with fewer than four agreements, it is
wrong, however reasonable the reason.

## `.env` is the source of truth

Reading the environment file tells you what the process will do. No variable is read
that the file does not declare, and no behaviour hides in a code default the file leaves
out. Three rules keep it that way:

1. **Declare every variable in `src/config/server-env.ts`.** Two other modules parse env
   — `automatic-delivery-release.ts` and `production-readiness.ts` — and they keep their
   injected records because pure and testable is worth more than one fewer parser. The
   schema is what stops an illegal value ever reaching them.
2. **Never add an environment-specific default in code.** `ATI_ONE_RETURN_URL` used to
   default to `http://localhost:3000/`, and a production process that forgot it sent
   people to a loopback address on their own machine. If there is no safe guess, require
   it.
3. **Edit the profile, not only your `.env`.** All three examples are parsed against the
   real schema by `npm run verify:fast`, so an example that drifts fails in CI rather
   than on somebody's machine.

Coherence rules in `superRefine` refuse combinations that cannot mean what they say. Add
one when you find another; a boot-time refusal that names the contradiction beats a
deployment that starts and behaves as though a flag were not set. Put them in the schema,
not in `getServerEnv` — a rule added after `parse` applies to the process and to nothing
else, so the test that validates the three profiles never reaches it.

Exactly four names are read straight from `process.env`, and none of them can go through
the schema. Every one is still written out in all three profiles, so the promise above
holds; what does not hold for these is rule 1, and trying to "fix" that breaks them.

```text
NEXT_PUBLIC_APP_BASE_PATH   inlined at build time - the bundler substitutes the literal
DEV_APP_ORIGIN              read in next.config.ts, which runs before the app exists
DELIVERY_TEST_RECIPIENT     read by the seed, a separate process from the application
NODE_ENV                    set by the runtime, not by us
```

## Governance you must not route around

Four controls exist because the alternative was worse. Each has been tested by
something real.

- **Maker-checker.** Import approval and notification-plan approval both refuse an
  approver who is also the requester. Not a config toggle.
- **Frozen content.** A committed job carries its recipients, rules, rendered email and
  a SHA-256 of that email. The executor verifies the hash before sending. Do not
  regenerate content at send time — the point is that what was approved is what goes.
- **Fail-closed recipient classification.** Partial acceptance is not success. One
  rejected address marks the whole job failed, because one job is one message and it was
  not accepted whole.
- **Idempotency.** `idempotencyKey` is a hash of occurrence, subscription, holiday date
  and policy versions. One job is one subscription for one holiday date; changing that
  grain changes what "sent" means.

## Naming the grain, because it is easy to get wrong

```text
occurrence   one holiday, one region set          the row in Notification planning
plan         a preview - no side effects          what "Preview plan" computes
commit       turns a plan into durable jobs       N jobs, one per matched subscription
job          one subscription, one email          carries its own recipients and policy version
attempt      one delivery try for one job         carries the provider's answer
```

"5 jobs · 1 sent" means one subscription received a message, not that four people are
waiting: the other four may be `PLANNED`, `CANCELLED` or `FAILED`, and those mean
opposite things. Never collapse job statuses into one summarising word.

## Where the surprises are

Things that cost real time here. Check these before assuming your change is broken.

- **The worker needs `--conditions=react-server`.** It reaches modules marked
  `import "server-only"`, whose package resolves to a throwing stub under every other
  condition. The error says "Client Component", which is the opposite of what is
  happening. It also needs `--env-file`; `tsx` does not read `.env`.
- **`next dev` reads `next.config.ts` once.** Changing `NEXT_PUBLIC_APP_BASE_PATH`
  requires a restart, not a reload.
- **Running mounted needs `allowedDevOrigins`.** Next refuses cross-origin requests for
  dev-only assets, and the framed app asks for them from the portal's address. Without
  it: chunks 404, client components never hydrate, and the HMR client thrashes hard
  enough that `AbortController` cancels every fetch — so lists spin forever and show no
  error, because an aborted load deliberately sets neither. Server-rendered pages keep
  working, which makes the app look half-broken rather than misconfigured. See
  `docs/ENVIRONMENT-PROFILES.md`.
- **The mount path has one declaration**, `DEFAULT_APP_BASE_PATH` in
  `src/config/app.ts`. It was three, they disagreed, and the cookie `Path` silently fell
  back to `/`.
- **If an open page starts repeating one request pair, the `_rsc` key is stale.** Fixed
  in `ai-portal`, and written here because the symptom appears in this app's routes.
  Next 16.3.1 derives `_rsc` from a SHA-256 of four routing headers; this app checks it
  and answers `307` to the corrected URL when it disagrees, the router re-issues its
  original key, and the pair repeats about twenty-five times a second for as long as the
  tab is open. The browser hashes a header set it then does not send, so the key is wrong
  before it leaves. The portal's proxy now recomputes the key from the headers it
  forwards — `alignedSearch` in its internal-app route.

  The investigation is worth more than the fix. Seven explanations were tested and
  eliminated first, every one of them plausible from reading the code: a browser
  extension, Keycloak's Home URL, a stale build, the session layer, the iframe and the
  proxy, link prefetching, and `basePath`. Two were eliminated by *shipping* a change
  that turned out to do nothing — the expensive way, and one of them left a comment
  claiming a fix that did not work.

  What ended it in a single reload was measuring instead of reasoning: recomputing the
  key at the boundary where the request is reassembled and printing it beside the key
  that arrived. Two requests with identical headers carried different keys, and there was
  nothing left to argue about.

  Two habits are worth taking from it. **Log the query string**, not just the path — the
  proxy's own log printed `url.pathname` alone, so two different URLs appeared as one URL
  alternating between `307` and `200`, which is not a thing that can happen and is why
  the trail went cold. And **do not ship a fix you have not measured**: a wrong fix costs
  more than no fix, because the comment beside it will be believed.

  Closing the tab stops it, because it is driven entirely by the client.
- **`redirect_uri` is the address the browser uses**, prefix and all — never the address
  the process binds. Keycloak compares it character for character and says only
  `Invalid parameter: redirect_uri`.
- **Seed writes through Prisma and bypasses Zod.** That is why the delivery-test routing
  can set `automaticSendAllowed`. Do not use it as a general way around validation.
- **`src/proxy.ts` is the middleware.** Next 16 deprecated `middleware.js` and renamed the
  convention to `proxy.js`, exporting `proxy` instead of `middleware`. Looking for a
  `middleware.ts` and concluding the rule 8 guard is unwired has already cost one
  investigation; `src/__tests__/proxy-guard.test.ts` settles it. This is what the block at
  the top of this file is warning about.
- **Cookie names are a contract with the portal**, not a local choice. ATI One clears an
  internal app's cookies at sign-out by matching
  `/^(?:__Secure-|__Host-)?([a-z0-9][a-z0-9-]*)-app\./` — nothing asks, and there is no
  registry. `ati_ph_session` did not match, so this app stayed signed in when everything
  else signed out. `__Host-` is illegal here: it promises `Path=/`, and these cookies are
  scoped to the mount path.
- **Vitest aliases `server-only` to its own no-op.** Without it every module carrying that
  marker fails at collection with a message naming "Client Component", and eighteen of
  them do.

## Working on the UI

The database records far more than the screens show, and the gap is where the value is.
Two rules learned from closing part of it:

- **Show the numbers, not a summarising word.** A row can be partly delivered and partly
  failed at once; any single label has to choose which half to hide.
- **Colour means "this needs you".** Only `FAILED`, `CANCELLED`, `LATE` and `RETRY_WAIT`
  are coloured. Colouring the normal states spends the reader's attention on rows that
  do not want it.
- **Facet counts ignore the current selection**, so a chip says what selecting it would
  find rather than zero.
- **Never render a frozen email body into the operator's document.** It goes in an
  iframe with `sandbox=""` — those are the exact bytes a mail system accepted.

## Before you say it works

```cmd
npm run verify:fast      typecheck, tests, lint
npm run verify           the above plus a build
```

- Do not weaken a test to make a change pass. If a guard no longer fits, replace it with
  a stronger one and say why in the test.
- Claims about behaviour need evidence from the running system, not from reading the
  code. Query the database, hit the endpoint, read the log line.
- Report what actually happened. A skipped step is a skipped step.

## Two things this repository does not decide

- **The Keycloak realm** belongs to `ati-sso`. Redirect URIs and clients are registered
  there by an administrator; nothing here may write to it.
- **Production email release** waits on ATI IT approving the sender route, the secret
  path, and the client-recipient scope. `EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED` records
  that decision; it does not make it.
