# ATI PH Product Acceptance Checklist

## Software-complete acceptance

- [x] Governed XLSX import and validation
- [x] Maker-checker import approval
- [x] Canonical holiday publication and revision lineage
- [x] Governed client, team, subscription, recipient and policy routing
- [x] Explainable notification matching and scheduling
- [x] Frozen recipient, rule and content snapshots
- [x] Maker-checker notification approval
- [x] Durable scheduler and worker lease
- [x] STREAM validation transport
- [x] Generic SMTP adapter
- [x] Manual SMTP connectivity test gate
- [x] Controlled frozen-content SMTP pilot gate
- [x] Automatic SMTP implementation with explicit enablement and kill switch
- [x] Production-only SMTP release approval gate
- [x] Bounded retry
- [x] Non-retry-safe SMTP lease recovery to OUTCOME_UNKNOWN
- [x] Partial and ambiguous SMTP outcome reconciliation
- [x] Manual mark delivered, retry and close failed
- [x] Trusted planning automation with shadow-only default
- [x] Policy-controlled automatic send eligibility
- [x] Zero-recipient detection
- [x] Scheduler lag alert
- [x] Delivery failure alert
- [x] Correction and replanning after prior notification commitment
- [x] Corrected occurrence forced through approval
- [x] Persistent worker heartbeat
- [x] Operational exception visibility
- [x] Delivery reconciliation queue
- [x] Operational audit visibility
- [x] Product overview notification metrics
- [x] Liveness, database readiness and full operational readiness endpoints
- [x] Controlled operational-alert retention job
- [x] Restart, retry, lease-safety and idempotency contracts covered by automated tests
- [x] Production configuration readiness report
- [x] Production runbooks
- [x] AI-agent production deployment runbook

## Production activation gates

The following can remain open after software completion

- [ ] ATI IT approves production SMTP route
- [ ] production secret vault or approved secret-management path is active
- [ ] client-recipient production scope is authorized
- [ ] monitoring and alert ownership are assigned
- [ ] production runbook is exercised with the operational owner
- [ ] controlled production/client-recipient pilot is accepted where required
- [ ] Operations attachment requirement is confirmed
- [ ] business owner gives production acceptance
- [ ] `EMAIL_SMTP_PRODUCTION_RELEASE_APPROVED=true` is set only after the above evidence exists

## Final technical gate before release

```cmd
npm run verify
npx prisma migrate deploy
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
git diff --check
npm run ops:production-readiness
```

Do not open automatic SMTP merely to make the readiness report look green

A production-ready application with external delivery intentionally blocked is a valid safe release state
