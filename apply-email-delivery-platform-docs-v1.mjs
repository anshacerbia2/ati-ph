import fs from "node:fs";
import { execFileSync } from "node:child_process";

const FILES = {
  proposal: "PROPOSAL.md",
  plan: "plan.md",
  architecture: "architecture.md",
  readme: "README.md",
  emailDoc: "docs/EMAIL-DELIVERY-PLATFORM.md",
};

const EMAIL_DOC = "# Email Delivery Engine and Platform Candidate\n\n| Metadata | Value |\n| --- | --- |\n| Status | Proposed Phase 3 capability and reusable platform candidate |\n| Version | 0.1.0 |\n| Date | 2026-08-17 |\n| First consumer | Public Holiday Notification Workflow |\n| Current implementation | Not yet implemented |\n| Initial adapter strategy | Generic SMTP first |\n| Provider selection | Runtime configuration |\n| Mandatory paid provider | None |\n\n## 1. Purpose\n\nDefine the provider-neutral email delivery capability required by Public Holiday Notification without coupling the workflow to Microsoft Graph, SMTP2GO, Brevo, MailerSend, Elastic Email, Postal, or any other single provider\n\nThe capability starts as a reusable module inside the `ati-ph` modular monolith\n\nIt becomes a formal shared platform only after a second real production consumer proves that the contract is stable and shared ownership is justified\n\n## 2. Boundary\n\nPublic Holiday owns:\n\n- Holiday eligibility\n- Client and service-team subscription matching\n- Notification policy selection\n- Holiday-specific recipient routing\n- Notification-run approval policy\n- Business snapshot and correlation to source holiday data\n\nNotification owns:\n\n- Email template versioning\n- Placeholder validation\n- Rendered subject and body\n- Frozen recipient snapshot\n- Provider-neutral message envelope\n- Preview behavior\n\nEmail Delivery owns:\n\n- Provider registry\n- Provider routing\n- Transport adapter selection\n- Provider capability metadata\n- Provider attempt history\n- Transport error classification\n- Provider acceptance evidence\n- Bounce or NDR correlation where supported\n- Provider-level health evidence\n- Safe provider fallback rules\n\nScheduling and Execution owns:\n\n- Due-work claiming\n- Worker lease recovery\n- Retry timing\n- Dead-letter handling\n- Kill switch\n- Idempotent execution mechanics\n\nThe Public Holiday domain must not read provider credentials or contain provider-specific send logic\n\n## 3. Logical Architecture\n\n```mermaid\nflowchart TD\n    PH[\"Public Holiday Workflow\"] --> NOTIF[\"Notification Engine\"]\n    NOTIF --> EXEC[\"Scheduling and Execution\"]\n    EXEC --> EMAIL[\"Email Delivery Engine\"]\n    EMAIL --> ROUTER[\"Provider Router\"]\n    ROUTER --> REG[\"Provider Registry\"]\n    REG --> SMTP[\"Generic SMTP Adapter\"]\n    REG --> API[\"Provider API Adapters\"]\n    SMTP --> RELAY[\"Corporate SMTP / SMTP2GO / MailerSend / Elastic Email / Postal SMTP\"]\n    API --> SPECIFIC[\"Microsoft Graph / provider-specific HTTP API\"]\n```\n\nProvider names in this document are examples of compatible targets, not procurement commitments\n\nNo paid provider is a mandatory architecture dependency\n\n## 4. Adapter Model\n\nAdapter implementation is trusted application code\n\nProvider configuration is runtime data\n\nThe application must never load arbitrary adapter source code from the database\n\nConceptual contract:\n\n```text\nsend(message, providerContext) -> deliveryResult\nclassifyError(providerError) -> deliveryClassification\ncheckHealth(providerContext) -> healthEvidence\nconsumeDeliveryEvent(providerEvent) -> correlatedDeliveryEvent\n```\n\n### 4.1 Generic SMTP adapter\n\nThe first transport adapter should be generic SMTP because it can work with many SMTP-compatible relays without changing business code\n\nProvider changes within the SMTP adapter type are configuration changes rather than source-code changes\n\nExamples of possible SMTP targets:\n\n- Existing corporate SMTP relay\n- SMTP2GO\n- MailerSend\n- Elastic Email\n- Self-hosted Postal\n- Another approved SMTP relay\n\nThe selected provider must still satisfy Operations, security, sender-domain, deliverability, and volume requirements\n\n### 4.2 Provider-specific adapters\n\nA provider-specific adapter is added only when required capability cannot be expressed safely through the generic SMTP contract\n\nExamples:\n\n- Microsoft Graph\n- Provider HTTP API\n- Provider-specific webhook or event API\n\nAdding a provider-specific adapter must not change the Public Holiday business contract\n\n## 5. Dynamic Provider Registry\n\nProvider records are configuration, not hardcoded business logic\n\nConceptual provider configuration:\n\n```text\nemail_provider\n--------------\nid\ncode\ndisplay_name\nadapter_type\nstatus\npriority\nsecret_ref\nconfiguration\ncapabilities\ncreated_at\nupdated_at\n```\n\n`secret_ref` points to an approved secret store\n\nCredentials are never stored directly in provider configuration JSON, source code, logs, audit metadata, or rendered artifacts\n\nExample adapter types:\n\n```text\nSMTP\nMICROSOFT_GRAPH\nPROVIDER_HTTP_API\n```\n\nExample capabilities:\n\n```text\nSEND\nHTML\nPLAIN_TEXT\nATTACHMENT\nPROVIDER_MESSAGE_ID\nDELIVERY_EVENT\nBOUNCE_EVENT\nNDR_CORRELATION\n```\n\nThe capability matrix prevents the router from selecting a provider that cannot satisfy the requested message contract\n\n## 6. Dynamic Routing\n\nRouting policy is also runtime configuration\n\nConceptual model:\n\n```text\nemail_route\n-----------\nid\nconsumer_code\nnotification_type\nprovider_id\npriority\nstatus\neffective_from\neffective_to\n```\n\nExample:\n\n```text\nPUBLIC_HOLIDAY + HOLIDAY_NOTICE\n\u2192 SMTP_PRIMARY\n\u2192 SMTP_SECONDARY\n```\n\nThe first implementation does not require sophisticated routing dimensions\n\nRouting becomes more advanced only when an actual use case requires additional dimensions such as consumer, message class, region, sender identity, or provider capability\n\n## 7. Provider Switching\n\nProvider switching is allowed without redeploy when:\n\n- The replacement provider uses an already implemented adapter type\n- Required capabilities are satisfied\n- Required sender and domain configuration is approved\n- Secret references are valid\n- The route is active\n- Operational validation has passed\n\nExample:\n\n```text\nSMTP2GO_PRIMARY\nadapter_type = SMTP\n\nMAILERSEND_PRIMARY\nadapter_type = SMTP\n```\n\nSwitching between these records can be a configuration change because both use the same trusted SMTP adapter\n\nSwitching to an adapter type that does not yet exist still requires code, tests, review, and deployment\n\n## 8. Safe Fallback\n\nProvider fallback must not be treated as a simple retry against another vendor\n\nA timeout does not prove that a provider failed to accept the message\n\nAutomatic fallback is permitted only when the platform has evidence that the previous provider did not accept the logical message\n\nRequired outcome classes:\n\n```text\nFAILED_BEFORE_ACCEPTANCE\nDEFINITIVE_PROVIDER_REJECTION\nRECIPIENT_PERMANENT_FAILURE\nACCEPTED\nUNKNOWN_OUTCOME\n```\n\nRules:\n\n- `FAILED_BEFORE_ACCEPTANCE` may use an approved fallback route\n- `DEFINITIVE_PROVIDER_REJECTION` may use a fallback only when the rejection is provider-specific rather than recipient-specific\n- `RECIPIENT_PERMANENT_FAILURE` does not switch provider automatically\n- `ACCEPTED` never switches provider\n- `UNKNOWN_OUTCOME` never switches provider automatically\n\nAn `UNKNOWN_OUTCOME` requires reconciliation or a provider-specific idempotency mechanism before another transport attempt is permitted\n\n## 9. Platform-Owned Idempotency\n\nThe logical message identity belongs to the Email Delivery Engine, not to a provider\n\nThe same platform idempotency key is retained across delivery attempts and provider changes\n\nConceptual identity includes the frozen notification job and message snapshot\n\nProvider attempt identity is separate:\n\n```text\nlogical message\n    \u251c\u2500\u2500 attempt 1 \u2192 provider A\n    \u2514\u2500\u2500 attempt 2 \u2192 provider B\n```\n\nOnly one logical successful delivery may exist for the same idempotency key\n\nProvider failover must therefore reuse the existing notification job and frozen snapshot rather than create a second logical notification\n\n## 10. Delivery Evidence\n\nProvider acceptance and final delivery are separate concepts\n\nThe platform records:\n\n- Provider selected\n- Adapter type\n- Attempt number\n- Attempt start and finish\n- Provider request identifier when available\n- Provider message identifier when available\n- Acceptance or rejection\n- Sanitized error classification\n- Retry eligibility\n- Bounce or NDR evidence where available\n- Final platform interpretation\n\nThe platform must not label an SMTP or HTTP acceptance response as confirmed recipient delivery\n\n## 11. Proposed Persistence\n\nThe following tables are Phase 3 target design and are not part of the current Phase 1 schema:\n\n```text\nemail_providers\nemail_routes\nnotification_jobs\ndelivery_attempts\ndelivery_events\n```\n\nThe complete physical schema is finalized during Phase 3 detailed design\n\nAll tables remain in the physical PostgreSQL `public` schema while module ownership remains explicit in application code\n\n## 12. Security\n\n- Provider credentials are referenced through an approved secret store\n- Secrets are resolved only inside the Email Delivery boundary\n- Public Holiday business code never receives raw provider credentials\n- Provider configuration changes require authorization and audit\n- Sender identity changes require authorization and audit\n- Provider route changes require authorization and audit\n- Sensitive provider responses are sanitized before logging or audit persistence\n- TLS is required for external transport\n- SMTP authentication and TLS mode are explicit configuration\n- Provider-specific webhooks require authenticity validation where supported\n\n## 13. Operational Controls\n\nPhase 3 must include:\n\n- Provider enable and disable control\n- Kill switch for new sends\n- Health evidence\n- Delivery attempt history\n- Transient retry\n- Permanent failure handling\n- Dead-letter handling\n- Manual retry with reason\n- Provider-route audit history\n- Alerting for provider outage or abnormal failure rate\n\nHealth checks may influence routing before a send starts\n\nA health check must never be used as proof that a send with an unknown outcome was not accepted\n\n## 14. Initial Provider Strategy\n\nThe recommended order is:\n\n```text\n1. Implement Generic SMTP Adapter\n2. Use an approved no-additional-license SMTP route when available\n3. Otherwise configure an approved SMTP-compatible provider for pilot\n4. Add Provider Registry and Route configuration\n5. Add safe fallback only after outcome classification is proven\n6. Add provider-specific API adapters only for required capabilities\n```\n\nSMTP2GO is a valid example of an initial SMTP-compatible provider\n\nExisting corporate SMTP, MailerSend, Elastic Email, or Postal may also satisfy the same generic SMTP adapter contract if approved\n\nMicrosoft Graph remains optional and is not a required dependency\n\nNo provider is selected solely because it currently offers a free plan\n\nOperational suitability, sender-domain control, deliverability, security, rate limits, and support requirements still apply\n\n## 15. Platform Evolution\n\n### Stage 1 \u2014 Reusable module\n\n- Lives inside `ati-ph`\n- First consumer is Public Holiday Notification\n- Provider-neutral interface is explicit\n- Provider configuration is dynamic\n- No independent service contract\n\n### Stage 2 \u2014 Shared internal capability\n\nTriggered only after a second real application consumes the same delivery contract\n\nRequired:\n\n- Named platform owner\n- Versioned consumer contract\n- Independent authorization model\n- Shared provider registry\n- Shared observability\n- Consumer isolation\n- Migration plan from in-process calls to shared API or events where required\n\n### Stage 3 \u2014 Email Delivery Platform\n\nIndependent deployment is justified only when scale, reliability, security, or release independence requires it\n\nAt that point applications may consume:\n\n```text\nPublic Holiday\nHRIS\nFinance\nFare Filing\nSLA Monitoring\n        \u2193\nEmail Delivery Platform\n        \u2193\nDynamic Provider Router\n```\n\nPlatform extraction is an evidence-based evolution, not a prerequisite for Phase 3\n\n## 16. Acceptance Criteria\n\nThe Email Delivery Engine is ready for controlled production use when:\n\n- Public Holiday can submit a provider-neutral frozen email message\n- Generic SMTP adapter passes contract tests\n- Provider selection is loaded from runtime configuration\n- Provider credentials are resolved through secret references\n- Switching between two providers using the same adapter type does not require business-code changes\n- Provider attempts remain traceable to one logical message\n- Repeated execution cannot create duplicate logical sends\n- Accepted messages are never automatically resent through another provider\n- Unknown outcomes are never automatically failed over\n- Permanent recipient failures are not retried through another provider\n- Transient pre-acceptance provider failures follow the approved route policy\n- Kill switch blocks new sends\n- Route changes and manual retries are audit-recorded\n- Provider acceptance is not presented as confirmed recipient delivery\n- Controlled pilot is accepted by Operations and IT\n\n## 17. Related Documents\n\n- `PROPOSAL.md`\n- `architecture.md`\n- `plan.md`\n- `docs/ACCESS-CONTROL.md`\n";
const PROPOSAL_EMAIL_SECTION = "## 18. Email Delivery Engine\n\n### 18.1 Architectural position\n\nThe proposed solution does not require Microsoft Graph, SMTP2GO, or any other paid provider as a fixed architecture dependency\n\nThe DSD Team proposes a provider-neutral **Email Delivery Engine** with:\n\n- Generic SMTP as the first transport adapter\n- Runtime-configured provider registry\n- Runtime-configured provider routing\n- Provider capability metadata\n- Provider-specific API adapters only when required\n- Platform-owned idempotency\n- Safe fallback rules that prevent duplicate delivery\n\nThe Public Holiday workflow remains independent of the selected provider\n\nThe detailed contract is maintained in `docs/EMAIL-DELIVERY-PLATFORM.md`\n\n### 18.2 Adapter model\n\nAdapter implementations are trusted application code\n\nProvider configuration is dynamic runtime data\n\nThe solution must not load arbitrary adapter code from the database\n\nConceptual interface:\n\n```text\nSend(message, provider_context) -> delivery_result\nClassifyError(provider_error) -> delivery_classification\nCheckHealth(provider_context) -> health_evidence\nConsumeDeliveryEvent(event) -> correlated_delivery_event\n```\n\nThe initial adapter should be generic SMTP\n\nSMTP-compatible providers can therefore be changed through configuration without changing Public Holiday business code, provided the selected provider satisfies the required capabilities and operational controls\n\nPossible SMTP-compatible targets include:\n\n- Existing corporate SMTP relay\n- SMTP2GO\n- MailerSend\n- Elastic Email\n- Self-hosted Postal\n- Another approved SMTP relay\n\nThese are provider examples, not commercial commitments\n\n### 18.3 Dynamic provider registry and routing\n\nThe proposed delivery model separates:\n\n```text\nProvider adapter implementation\n\u2192 trusted code and deployment\n\nProvider configuration\n\u2192 runtime configuration\n\nProvider routing policy\n\u2192 runtime configuration\n\nProvider credentials\n\u2192 approved secret store\n```\n\nConceptual provider records include:\n\n```text\nprovider code\nadapter type\nstatus\npriority\nsecret reference\nconfiguration\ncapabilities\n```\n\nConceptual routing records can select an ordered provider route by consumer and notification type\n\nThe first implementation does not require complex routing rules beyond the real Public Holiday use case\n\n### 18.4 Provider switching\n\nA provider can be switched without redeployment when the replacement uses an adapter type already implemented by the system\n\nFor example, two SMTP-compatible providers can both use the Generic SMTP Adapter while their host, port, TLS, secret reference, and routing priority remain configuration\n\nA new transport protocol or provider-specific API still requires an explicit trusted adapter, tests, security review, and deployment\n\n### 18.5 Safe fallback\n\nProvider fallback is not a blind retry against another provider\n\nA timeout can leave the delivery outcome uncertain\n\nRequired delivery classifications include:\n\n```text\nFAILED_BEFORE_ACCEPTANCE\nDEFINITIVE_PROVIDER_REJECTION\nRECIPIENT_PERMANENT_FAILURE\nACCEPTED\nUNKNOWN_OUTCOME\n```\n\nRules:\n\n- A proven pre-acceptance provider failure may use an approved fallback route\n- A provider-specific rejection may use a fallback when the recipient itself is not the failure\n- A permanent recipient failure does not switch provider automatically\n- An accepted message never switches provider\n- An unknown outcome never switches provider automatically\n\nThe platform must reconcile an unknown outcome before another provider attempt is permitted\n\n### 18.6 Platform evolution\n\nThe Email Delivery Engine begins as a reusable module inside the Public Holiday modular monolith\n\nIt is intentionally designed so the provider-neutral contract can later serve additional internal applications\n\nA standalone Email Delivery Platform is created only after a second real production consumer proves the contract and independent ownership or deployment is justified\n\nThis preserves the current architecture principle of proving reuse before extracting a platform service\n";
const PHASE3_PROPOSAL = "### Phase 3 \u2014 Controlled email delivery\n\nCurrent position: **proposed**\n\n- Provider-neutral Email Delivery Engine\n- Generic SMTP adapter as the initial transport adapter\n- Dynamic provider registry\n- Dynamic provider route configuration\n- Provider capability metadata\n- Approved sender identity\n- Test-send\n- Notification-run approval\n- Durable scheduled job execution\n- Transactional outbox processing\n- Atomic worker claims and lease recovery\n- Platform-owned idempotency across provider attempts\n- Safe fallback only for proven pre-acceptance or provider-specific failures\n- Unknown-outcome reconciliation before any provider switch\n- Transient retry and permanent failure handling\n- Dead-letter handling\n- NDR or bounce monitoring where supported\n- Error dashboard and delivery evidence\n- Manual cancellation and authorized retry\n- Optional provider-specific API adapters when Generic SMTP is insufficient\n\nNo paid provider is a mandatory dependency of the solution architecture\n\nSMTP2GO, an existing corporate SMTP relay, MailerSend, Elastic Email, Postal, or another approved SMTP-compatible provider can use the same Generic SMTP Adapter when they satisfy the agreed operational and security requirements\n\nExit criteria:\n\n- Controlled pilot completes without duplicate sends\n- Delivery evidence is traceable to source batch and frozen notification snapshot\n- Provider changes within an implemented adapter type do not require Public Holiday business-code changes\n- Accepted or unknown-outcome messages are not automatically resent through another provider\n- Permanent recipient failures do not retry automatically or fail over to another provider\n- Cancellation and recovery procedures are tested\n";
const PLAN_PHASE3 = "## 6. Phase 3 \u2014 Controlled Email Delivery\n\n### Objective\n\nEnable production email through a provider-neutral delivery capability with traceable attempts, dynamic provider configuration, and safe provider switching\n\n### Scope\n\n#### Notification module\n\n- Provider-neutral frozen message envelope\n- Rendered message and recipient snapshot handoff\n- Test-send request\n- Notification-run approval\n- Approval invalidation when frozen snapshot changes\n\n#### Email Delivery Engine\n\n- Generic SMTP adapter as the first transport adapter\n- Dynamic provider registry\n- Dynamic provider routing\n- Provider capability metadata\n- Provider secret references\n- Delivery attempt recording\n- Transient, permanent, accepted, and unknown-outcome classification\n- Safe fallback only when the previous provider is proven not to have accepted the message\n- NDR or bounce ingestion where the selected provider supports it\n- Provider-specific API adapters only when a required capability is not available through Generic SMTP\n- Error summary report\n\n#### Scheduling and Execution module\n\n- Due-job claiming\n- Worker lease recovery\n- Exponential retry with jitter\n- Platform-owned idempotency across provider attempts\n- Dead-letter handling\n- Manual retry with reason\n- Kill switch\n\n### Proposed tables\n\nLogical ownership remains separate even though the modular monolith uses PostgreSQL `public`\n\n```text\nemail_providers\nemail_routes\nnotification_jobs\ndelivery_attempts\ndelivery_events\n```\n\nThe physical Phase 3 schema is finalized during implementation and is not claimed as part of the current Phase 1 baseline\n\n### Initial provider strategy\n\n- Prefer an approved existing corporate SMTP relay when it satisfies the operating requirements\n- Otherwise configure an approved SMTP-compatible provider for the pilot\n- SMTP2GO is a valid example of an SMTP-compatible initial provider\n- MailerSend, Elastic Email, Postal, or another approved SMTP relay can use the same Generic SMTP Adapter\n- Microsoft Graph remains an optional provider-specific adapter, not a required dependency\n- No paid provider is mandatory in the architecture\n- Provider selection must consider sender-domain control, deliverability, security, volume, limits, and support requirements rather than free-tier availability alone\n\n### Pilot rules\n\n- Start with limited clients or an internal recipient group\n- Require explicit run approval\n- Require test-send completion\n- Enable a kill switch that stops new sends\n- Do not label provider acceptance as confirmed delivery\n- Never automatically switch provider after `ACCEPTED`\n- Never automatically switch provider after `UNKNOWN_OUTCOME`\n- Do not route a permanent recipient failure to another provider\n- Review all failures daily during pilot\n\n### Exit gate\n\n- No duplicate sends under retry, worker restart, and approved provider-fallback tests\n- Provider credentials are isolated behind the Email Delivery boundary\n- Provider configuration can switch between providers using the same implemented adapter type without Public Holiday business-code changes\n- Permanent recipient failure does not retry automatically\n- Unknown outcomes require reconciliation before another provider attempt\n- Operational team can cancel unsent jobs\n- Delivery attempt and source batch are traceable from every sent email\n";
const PLAN_PHASE5 = "## 8. Phase 5 \u2014 Reuse Validation with a Second Application\n\n### Objective\n\nProve which modules are genuinely platform capabilities\n\nThe Email Delivery Engine is an explicit platform candidate because its provider registry, routing, adapters, delivery evidence, and idempotency contract are intentionally business-domain neutral\n\nIt still remains a module until a second production consumer validates the contract\n\n### Candidate second consumers\n\n| Candidate | Reusable modules exercised |\n| --- | --- |\n| Fare filing exception notification | Import, Approval, Notification, Email Delivery, Artifact, Audit |\n| SLA breach reminder | Notification, Email Delivery, Scheduling, Artifact, Audit |\n| Contract expiry workflow | Notification, Email Delivery, Scheduling, Approval, Audit |\n| Finance reconciliation exception | Import, Approval, Notification, Email Delivery, Artifact, Audit |\n\n### Required before adoption\n\n- Second application has a real product owner and production use case\n- Shared contract is reviewed by both owners\n- Provider-neutral message contract is stable\n- Module-specific authorization is defined\n- Provider and sender ownership are defined\n- Consumer isolation is defined\n- Data ownership remains clear\n- Existing Public Holiday behavior remains regression-tested\n\n### Decision gate\n\nChoose one:\n\n- Keep Email Delivery as a shared module inside the existing modular boundary\n- Promote Email Delivery to a formal shared internal capability\n- Extract an Email Delivery Platform service only if independent deployment is justified\n";
const PLAN_NOTIFICATION_BACKLOG = "### Notification\n\n- Template editor and versioning\n- Placeholder allow-list\n- Rendered preview\n- Recipient snapshot\n- Provider-neutral delivery request\n\n### Email Delivery Engine\n\n- Generic SMTP adapter\n- Provider registry\n- Provider routing\n- Provider capability matrix\n- Secret references\n- Provider-neutral idempotency\n- Delivery attempt evidence\n- Safe fallback classification\n- Unknown-outcome reconciliation\n- Optional provider-specific API adapters\n- NDR or bounce processing\n";
const PLAN_GUARDRAILS = "## 14. Scope Guardrails\n\nDo not add these before their need is proven:\n\n- Visual workflow designer\n- Generic BPMN runtime\n- Generic rule authoring language\n- Arbitrary provider adapter code loaded dynamically from the database\n- Provider-specific business logic inside the Public Holiday domain\n- Complex multi-dimensional email routing beyond a demonstrated consumer requirement\n- Microservices\n- Kubernetes\n- AI holiday extraction\n- Self-service external client portal\n- Reply classification automation\n- ATI One cookie or application-token reuse\n- Changes to the ATI One source repository as part of `ati-ph` implementation\n- Browser access that bypasses the approved ATI One internal-app entry path\n- Expansion of the shared Keycloak client exception beyond OIDC client identity and credentials\n- Durable scheduler, retry, email send, or workbook generation executed as unawaited work inside a Next.js request\n\nDynamic provider configuration and ordered provider routing are allowed because they are now an explicit Phase 3 requirement\n\nAdapter implementations remain trusted code and are not arbitrary runtime plugins\n";
const PLAN_NEXT_DECISION = "## 16. Next Decision\n\nComplete the remaining Phase 1 acceptance gates first:\n\n1. Run the agreed end-to-end smoke with the worker active\n2. Complete mounted ATI One acceptance\n3. Obtain Operations business-owner verification of canonical publication evidence\n\nThen begin Phase 2 Client Routing, Preview, and Governed Output\n\nPhase 3 Email Delivery detailed design may continue in parallel at the contract level, using `docs/EMAIL-DELIVERY-PLATFORM.md` as the provider-neutral baseline, but external email delivery must not be enabled before the Phase 2 shadow-mode result is accepted\n\nNo specific paid provider is a prerequisite for Phase 2\n\nThe first Phase 3 transport adapter is Generic SMTP, while the concrete provider remains runtime configuration subject to Operations, IT, security, sender-domain, and deliverability approval\n";
const ARCH_DECISION = "## 1. Architectural Decision\n\nBuild Public Holiday Notification as the first vertical slice of an operational workflow platform\n\nIt consumes reusable modules for import, approval, notification, email delivery, scheduling, artifacts, and audit. Those modules remain in one deployable until a second real consumer and stable contract justify extraction\n\nThis is deliberately not a microservice architecture and not a generic workflow platform\n\nThe Email Delivery capability is designed as a provider-neutral reusable engine from its first implementation because provider selection and routing are infrastructure concerns rather than Public Holiday business rules\n\nGeneric SMTP is the initial transport adapter. Provider records and routing are dynamic configuration. Provider-specific adapters are trusted code added only when required capabilities cannot be satisfied by an existing adapter\n\nNo paid email provider is a mandatory architecture dependency\n\nThe Public Holiday codebase, database, worker, authorization rules, and business operations remain independently owned. Its initial browser delivery is through ATI One's internal same-origin proxy and iframe path. ATI One does not participate in Public Holiday business logic, but it is the initial browser entry point and delivery gateway\n\nAs an explicit temporary exception, `ati-ph` uses the same Keycloak client ID and client credential configuration as ATI One. It still creates its own namespaced application session. Keycloak is the identity and authentication authority only: ATI PH does not derive business authorization from Keycloak realm roles. Application roles, permissions, and menu visibility are resolved from ATI PH-owned PostgreSQL records. The role-permission catalog, maker-checker rules, and application access-control invariants are documented in [docs/ACCESS-CONTROL.md](docs/ACCESS-CONTROL.md). This exception is documented for later separation and must not be interpreted as permission to reuse ATI One cookies or application authorization state\n";
const ARCH_NOTIFICATION = "### 6.3 Notification Engine\n\n#### Purpose\n\nRender a business notification into an immutable provider-neutral message without allowing the business domain to depend on email transport implementation\n\n#### Owns\n\n```text\nemail_template\nemail_template_version\ntemplate_assignment when assignment is generic\nnotification_snapshot\nnotification_recipient\n```\n\n#### Interface\n\n```text\nrenderMessage(request)\npreviewMessage(messageId)\ntestSend(messageId, recipient)\nscheduleMessage(messageId, scheduledAt)\nrequestDelivery(messageId)\n```\n\n#### Required request data\n\n```text\nbusiness_reference\nnotification_type\ntemplate_version\nrecipient snapshot\nplaceholder values\nschedule\ncorrelation ID\n```\n\n#### Invariants\n\n- Rendering is immutable once approved or sent\n- Notification does not select provider credentials\n- Notification produces a provider-neutral frozen message\n- Retry never regenerates the approved content\n\n#### Reuse examples\n\n- SLA breach email\n- Contract expiry reminder\n- Fare filing exception notification\n- Approval notification\n\n### 6.4 Email Delivery Engine\n\n#### Purpose\n\nDeliver a frozen provider-neutral message through dynamically configured providers without coupling consumer applications to one vendor\n\n#### Owns\n\n```text\nemail_provider\nemail_route\nprovider capability metadata\ndelivery_attempt\ndelivery_event\nprovider adapter contract\nprovider routing policy\n```\n\n#### Initial adapter strategy\n\n```text\nGeneric SMTP Adapter\n    \u251c\u2500\u2500 Corporate SMTP relay\n    \u251c\u2500\u2500 SMTP2GO\n    \u251c\u2500\u2500 MailerSend\n    \u251c\u2500\u2500 Elastic Email\n    \u2514\u2500\u2500 Postal SMTP\n\nOptional provider-specific adapters\n    \u2514\u2500\u2500 Microsoft Graph or another required provider API\n```\n\nProvider names are examples, not procurement commitments\n\nNo paid provider is a mandatory dependency\n\n#### Interface\n\n```text\ndeliver(message, routeContext)\nclassifyProviderError(error)\nresolveProvider(routeContext)\ncheckProviderHealth(providerId)\nrecordDeliveryEvent(providerEvent)\n```\n\n#### Dynamic configuration\n\nAdapter implementations are trusted code\n\nProvider records and routing policy are runtime configuration\n\nSecrets are represented by secret references and resolved only inside this module\n\nChanging between providers that use an already implemented adapter type must not require Public Holiday business-code changes\n\n#### Fallback invariants\n\n- The logical idempotency key belongs to the platform, not the provider\n- `FAILED_BEFORE_ACCEPTANCE` may use an approved fallback route\n- Provider-specific rejection may fall back only when the recipient itself is not the failure\n- Permanent recipient failure does not fall back automatically\n- `ACCEPTED` never falls back\n- `UNKNOWN_OUTCOME` never falls back automatically\n- A second provider attempt reuses the same logical message and frozen snapshot\n\n#### Platform maturity\n\nThe engine begins as Stage 1 inside `ati-ph`\n\nIt becomes a shared internal capability only after a second production consumer validates the same contract\n\nIt becomes an independently deployed Email Delivery Platform only when extraction criteria in this architecture are satisfied\n\nSee `docs/EMAIL-DELIVERY-PLATFORM.md` for the detailed contract\n";
const PROPOSAL_ACCEPTANCE_EXTRA = "- Provider selection is runtime configuration rather than Public Holiday business logic\n- Switching between providers that use the same implemented adapter type does not require Public Holiday business-code changes\n- Accepted messages are never automatically resent through another provider\n- Unknown delivery outcomes are never automatically failed over\n";

function readNormalized(path) {
  const raw = fs.readFileSync(path, "utf8");
  return {
    raw,
    eol: raw.includes("\r\n") ? "\r\n" : "\n",
    text: raw.replace(/\r\n/g, "\n"),
  };
}

function writeWithEol(path, text, eol) {
  fs.writeFileSync(path, text.replace(/\n/g, eol), "utf8");
}

function headingLevel(heading) {
  const match = /^(#+)\s/.exec(heading);
  if (!match) throw new Error(`Invalid heading: ${heading}`);
  return match[1].length;
}

function replaceSection(text, heading, newSection) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line === heading);
  if (start < 0) {
    if (text.includes(newSection.trim())) return text;
    throw new Error(`Heading not found: ${heading}`);
  }

  const level = headingLevel(heading);
  let end = lines.length;

  for (let i = start + 1; i < lines.length; i += 1) {
    const match = /^(#+)\s/.exec(lines[i]);
    if (match && match[1].length <= level) {
      end = i;
      break;
    }
  }

  const replacement = newSection.trim().split("\n");
  return [
    ...lines.slice(0, start),
    ...replacement,
    "",
    ...lines.slice(end),
  ].join("\n");
}

function replaceExactOrAlready(text, oldValue, newValue, label) {
  if (text.includes(newValue)) return text;
  if (!text.includes(oldValue)) {
    throw new Error(`${label}: expected source text was not found`);
  }
  return text.replace(oldValue, newValue);
}

function insertAfter(text, anchor, addition, sentinel, label) {
  if (text.includes(sentinel)) return text;
  const index = text.indexOf(anchor);
  if (index < 0) throw new Error(`${label}: anchor not found`);
  const end = index + anchor.length;
  return text.slice(0, end) + addition + text.slice(end);
}

const proposal = readNormalized(FILES.proposal);
const plan = readNormalized(FILES.plan);
const architecture = readNormalized(FILES.architecture);
const readme = readNormalized(FILES.readme);

let nextProposal = proposal.text;
let nextPlan = plan.text;
let nextArchitecture = architecture.text;
let nextReadme = readme.text;

nextProposal = replaceExactOrAlready(
  nextProposal,
  "| Version | 0.2.0 |",
  "| Version | 0.2.1 |",
  "PROPOSAL version",
);

nextProposal = replaceExactOrAlready(
  nextProposal,
  "| Email integration | Provider adapter; Microsoft Graph when Microsoft 365 is the approved email platform |",
  "| Email integration | Provider-neutral Email Delivery Engine; Generic SMTP first; provider selection and routing are runtime configuration |",
  "PROPOSAL email metadata",
);

nextProposal = replaceExactOrAlready(
  nextProposal,
  "- Provider-specific email integration behind an adapter",
  "- Provider-neutral Email Delivery Engine with Generic SMTP first and dynamically configured providers",
  "PROPOSAL executive email bullet",
);

nextProposal = replaceExactOrAlready(
  nextProposal,
  "- Replace enterprise identity or email platforms",
  "- Replace enterprise identity or operate as a general-purpose mailbox or marketing platform",
  "PROPOSAL non-goal",
);

nextProposal = insertAfter(
  nextProposal,
  "- Output artifacts have a cryptographic checksum",
  `
- Provider selection is infrastructure configuration, not Public Holiday business logic
- Provider adapter implementations are trusted code while provider records and routing are runtime configuration
- Provider fallback never occurs automatically after provider acceptance or an unknown delivery outcome`,
  "Provider selection is infrastructure configuration",
  "PROPOSAL invariants",
);

nextProposal = replaceExactOrAlready(
  nextProposal,
  '    WORKER --> EMAIL["Approved Email Provider Adapter - later delivery phase"]',
  `    WORKER --> EMAIL["Email Delivery Engine - later delivery phase"]
    EMAIL --> ROUTER["Dynamic Provider Router"]
    ROUTER --> SMTP["Generic SMTP Adapter"]
    ROUTER --> API["Optional Provider API Adapter"]`,
  "PROPOSAL architecture diagram",
);

nextProposal = replaceExactOrAlready(
  nextProposal,
  "| Delivery and Monitoring | Provider calls, delivery attempts, NDR or bounce evidence | Proposed delivery phase |",
  "| Email Delivery Engine | Generic SMTP, provider registry, dynamic routing, provider adapters, delivery attempts, NDR or bounce evidence | Proposed delivery phase |",
  "PROPOSAL module table",
);

nextProposal = replaceSection(
  nextProposal,
  "### 14.10 Delivery",
  `### 14.10 Delivery

The following is the proposed target model for a later delivery phase and is not part of the current Phase 1 physical implementation

#### \`email_provider\`

Conceptual provider configuration. Physical column details are finalized during Phase 3 detailed design

| Column | Purpose |
| --- | --- |
| \`id\` | Provider identity |
| \`code\` | Stable provider code |
| \`adapter_type\` | Trusted adapter implementation such as SMTP or MICROSOFT_GRAPH |
| \`status\` | Active or inactive routing state |
| \`priority\` | Default routing priority where applicable |
| \`secret_ref\` | Reference to approved secret storage |
| \`configuration\` | Non-secret provider configuration |
| \`capabilities\` | Supported delivery capabilities |

#### \`email_route\`

Conceptual runtime routing configuration

| Column | Purpose |
| --- | --- |
| \`id\` | Route identity |
| \`consumer_code\` | Consumer such as PUBLIC_HOLIDAY |
| \`notification_type\` | Message class |
| \`provider_id\` | Configured provider |
| \`priority\` | Ordered route priority |
| \`status\` | Active or inactive |
| \`effective_from\` | Optional route activation |
| \`effective_to\` | Optional route retirement |

#### \`delivery_attempt\`

| Column | Type | Purpose |
| --- | --- | --- |
| \`id\` | UUID | Attempt identity |
| \`notification_job_id\` | UUID | Parent logical notification job |
| \`provider_id\` | UUID | Provider selected by the Email Delivery Engine |
| \`attempt_number\` | SMALLINT | Monotonic attempt number |
| \`provider_request_id\` | VARCHAR(255), nullable | Provider request correlation |
| \`provider_message_id\` | VARCHAR(500), nullable | Provider message identifier where available |
| \`status\` | VARCHAR(40) | STARTED, ACCEPTED, FAILED_BEFORE_ACCEPTANCE, FAILED_PERMANENT, UNKNOWN_OUTCOME |
| \`error_category\` | VARCHAR(50), nullable | Sanitized error classification |
| \`error_code\` | VARCHAR(100), nullable | Machine-readable provider error |
| \`error_message\` | TEXT, nullable | Sanitized diagnostic text |
| \`retry_after_at\` | TIMESTAMPTZ, nullable | Provider-directed retry time |
| \`response_metadata\` | JSONB, nullable | Sanitized provider metadata |
| \`started_at\` | TIMESTAMPTZ | Attempt start |
| \`finished_at\` | TIMESTAMPTZ, nullable | Attempt completion |

The same logical notification and idempotency key are reused when an approved fallback provider is attempted

#### \`delivery_event\`

| Column | Type | Purpose |
| --- | --- | --- |
| \`id\` | UUID | Event identity |
| \`notification_job_id\` | UUID, nullable | Correlated logical message |
| \`delivery_attempt_id\` | UUID, nullable | Correlated attempt |
| \`provider_event_id\` | VARCHAR(255), nullable | Provider event deduplication |
| \`event_type\` | VARCHAR(40) | NDR, BOUNCE, NO_FAILURE_RECEIVED, ADMIN_TRACE, or provider-supported event |
| \`recipient_email\` | VARCHAR(320), nullable | Affected recipient |
| \`classification\` | VARCHAR(30) | TRANSIENT, PERMANENT, INFORMATIONAL, or UNKNOWN |
| \`raw_artifact_id\` | UUID, nullable | Raw provider evidence when retained |
| \`metadata\` | JSONB, nullable | Sanitized parsed evidence |
| \`occurred_at\` | TIMESTAMPTZ | Provider event time |
| \`received_at\` | TIMESTAMPTZ | Application receipt time |

Provider configuration is dynamic, but adapter source code is not loaded dynamically from the database

Generic SMTP is the initial adapter target. SMTP2GO, corporate SMTP, MailerSend, Elastic Email, Postal, or another approved SMTP-compatible relay can use that same adapter contract

Microsoft Graph remains an optional provider-specific adapter rather than a required dependency
`,
);

nextProposal = replaceSection(
  nextProposal,
  "## 18. Email Integration",
  PROPOSAL_EMAIL_SECTION,
);

nextProposal = replaceSection(
  nextProposal,
  "### Phase 3 — Controlled email delivery",
  PHASE3_PROPOSAL,
);

nextProposal = insertAfter(
  nextProposal,
  "- Security review approves mailbox permissions and file handling",
  `\n${PROPOSAL_ACCEPTANCE_EXTRA.trimEnd()}`,
  "Provider selection is runtime configuration",
  "PROPOSAL acceptance",
);

nextProposal = replaceExactOrAlready(
  nextProposal,
  "| Email platform | Finalizes delivery adapter and provider evidence |",
  "| Initial outbound email route and approved sender identity | Finalizes the first configured provider while preserving provider-neutral delivery |",
  "PROPOSAL decision email platform",
);

nextProposal = insertAfter(
  nextProposal,
  "| Initial outbound email route and approved sender identity | Finalizes the first configured provider while preserving provider-neutral delivery |",
  "\n| Provider routing and fallback policy | Defines whether and when another provider can be selected without duplicate-send risk |",
  "Provider routing and fallback policy",
  "PROPOSAL routing decision",
);

nextProposal = insertAfter(
  nextProposal,
  "The DSD Team recommends shadow-mode reconciliation before external email delivery and controlled delivery before trusted automation",
  `

The DSD Team recommends implementing email delivery as a provider-neutral reusable engine with Generic SMTP as the first adapter, runtime provider configuration, and safe fallback semantics. This avoids making Microsoft Graph or any paid provider a mandatory dependency while preserving a clear path to a shared Email Delivery Platform after a second production consumer validates the contract`,
  "provider-neutral reusable engine",
  "PROPOSAL final decision",
);

nextPlan = replaceExactOrAlready(
  nextPlan,
  "| Version | 0.3.16 |",
  "| Version | 0.3.17 |",
  "plan version",
);

nextPlan = replaceExactOrAlready(
  nextPlan,
  "- Confirmed email platform and sender mailbox owner",
  "- Confirmed initial outbound email route or relay, approved sender identity, and owning team",
  "plan Phase 0 email input",
);

nextPlan = replaceExactOrAlready(
  nextPlan,
  "| Email sender mailbox and reply handling | IT and process owner |",
  "| Initial outbound email route, sender identity, and reply handling | IT and process owner |",
  "plan Phase 0 decision",
);

nextPlan = replaceSection(
  nextPlan,
  "## 6. Phase 3 — Controlled Email Delivery",
  PLAN_PHASE3,
);

nextPlan = replaceSection(
  nextPlan,
  "## 8. Phase 5 — Reuse Validation with a Second Application",
  PLAN_PHASE5,
);

nextPlan = replaceExactOrAlready(
  nextPlan,
  "| 8 | Provider delivery and retry | Adds external side effect only after result is trusted |",
  "| 8 | Email Delivery Engine, provider routing, and retry | Adds external side effect only after result is trusted while avoiding provider lock-in |",
  "plan workstream order",
);

if (!nextPlan.includes("### Email Delivery Engine")) {
  nextPlan = replaceSection(
    nextPlan,
    "### Notification",
    PLAN_NOTIFICATION_BACKLOG,
  );
}

nextPlan = insertAfter(
  nextPlan,
  "- Kill switch blocks new sends",
  `
- Provider selection is loaded from runtime configuration
- Switching providers that use the same trusted adapter type requires no Public Holiday business-code change
- Accepted messages never automatically fall back to another provider
- Unknown outcomes never automatically fall back to another provider`,
  "Provider selection is loaded from runtime configuration",
  "plan delivery gate",
);

nextPlan = insertAfter(
  nextPlan,
  "- Provider throttling or outage",
  `
- Provider route change and rollback
- Unknown delivery outcome reconciliation`,
  "Provider route change and rollback",
  "plan runbooks",
);

nextPlan = replaceSection(
  nextPlan,
  "## 14. Scope Guardrails",
  PLAN_GUARDRAILS,
);

nextPlan = insertAfter(
  nextPlan,
  "- Email delivery has approval, retry, cancellation, and error controls",
  `
- Email delivery is provider-neutral and Generic SMTP is the initial adapter
- Provider selection and ordered routing are runtime configuration
- Provider failover cannot resend an accepted or unknown-outcome logical message`,
  "Email delivery is provider-neutral",
  "plan definition of done",
);

nextPlan = replaceSection(
  nextPlan,
  "## 16. Next Decision",
  PLAN_NEXT_DECISION,
);

nextArchitecture = replaceExactOrAlready(
  nextArchitecture,
  "| Version | 0.3.16 |",
  "| Version | 0.3.17 |",
  "architecture version",
);

nextArchitecture = replaceSection(
  nextArchitecture,
  "## 1. Architectural Decision",
  ARCH_DECISION,
);

nextArchitecture = replaceExactOrAlready(
  nextArchitecture,
  `    APP --> MSG["Notification Module"]
    APP --> SCH["Scheduling and Execution Module"]
    APP --> ART["Artifact Module"]
    APP --> AUD["Audit Module"]
    MSG --> MAIL["Approved Email Provider"]`,
  `    APP --> MSG["Notification Module"]
    APP --> SCH["Scheduling and Execution Module"]
    APP --> ART["Artifact Module"]
    APP --> AUD["Audit Module"]
    MSG --> EDP["Email Delivery Engine"]
    EDP --> ROUTER["Dynamic Provider Router"]
    ROUTER --> SMTP["Generic SMTP Adapter"]
    ROUTER --> PAPI["Optional Provider API Adapter"]`,
  "architecture logical diagram",
);

nextArchitecture = replaceExactOrAlready(
  nextArchitecture,
  '    WORKER --> MAIL["Approved Email Provider"]',
  `    WORKER --> EDP["Email Delivery Engine"]
    EDP --> SMTP["Generic SMTP / configured provider"]
    EDP --> PAPI["Optional provider API adapter"]`,
  "architecture deployment diagram",
);

nextArchitecture = replaceExactOrAlready(
  nextArchitecture,
  "| Notification | Template version, message rendering, recipient snapshot, provider adapter, delivery attempts and events | Holiday selection or client subscription policy |",
  `| Notification | Template version, message rendering, recipient snapshot, provider-neutral message envelope | Holiday selection, client subscription policy, provider credentials, provider routing |
| Email Delivery | Provider registry, routing, adapter selection, provider capabilities, delivery attempts and events | Holiday eligibility, template selection, business recipient policy |`,
  "architecture ownership table",
);

if (!nextArchitecture.includes("### 6.4 Email Delivery Engine")) {
  nextArchitecture = replaceSection(
    nextArchitecture,
    "### 6.3 Notification Engine",
    ARCH_NOTIFICATION,
  );
}

nextArchitecture = replaceExactOrAlready(
  nextArchitecture,
  "### 6.4 Scheduling and Execution Engine",
  "### 6.5 Scheduling and Execution Engine",
  "architecture scheduling heading",
);
nextArchitecture = replaceExactOrAlready(
  nextArchitecture,
  "### 6.5 Artifact Engine",
  "### 6.6 Artifact Engine",
  "architecture artifact heading",
);
nextArchitecture = replaceExactOrAlready(
  nextArchitecture,
  "### 6.6 Audit Engine",
  "### 6.7 Audit Engine",
  "architecture audit heading",
);

nextArchitecture = insertAfter(
  nextArchitecture,
  "| `outbox_events` | Scheduling and Execution |",
  "\n| future `email_providers`, `email_routes`, `delivery_attempts`, `delivery_events` | Email Delivery |",
  "future `email_providers`",
  "architecture ownership table family",
);

nextArchitecture = replaceExactOrAlready(
  nextArchitecture,
  "- Domain module reading raw provider secrets",
  "- Domain or Notification module reading raw provider secrets",
  "architecture cross-module secret rule",
);

nextArchitecture = replaceSection(
  nextArchitecture,
  "### 8.1 Event flow",
  `### 8.1 Event flow

\`\`\`mermaid
flowchart TD
    A["ImportBatchValidated"] --> B["Holiday validates business rules"]
    B --> C["HolidayOccurrencePublished"]
    C --> D["NotificationRequested"]
    D --> E["Message rendered and scheduled"]
    E --> F["EmailDeliveryRequested"]
    F --> G["Provider selected and attempt recorded"]
    G --> H["Provider accepted, failed, or outcome unknown"]
    H --> I["Audit and operational reporting"]
\`\`\`
`,
);

nextArchitecture = replaceSection(
  nextArchitecture,
  "### 8.3 Required events",
  `### 8.3 Required events

| Event | Producer | Required consumer behavior |
| --- | --- | --- |
| \`ImportBatchValidated\` | Import | Public Holiday evaluates domain rules |
| \`ImportBatchApproved\` | Approval | Public Holiday publishes canonical occurrence data |
| \`HolidayOccurrencePublished\` | Public Holiday | Planner evaluates affected subscriptions |
| \`NotificationRequested\` | Public Holiday | Notification renders message and stores snapshot |
| \`NotificationScheduled\` | Notification | Execution selects it when due |
| \`EmailDeliveryRequested\` | Scheduling and Execution | Email Delivery resolves provider route and creates an attempt |
| \`EmailAcceptedByProvider\` | Email Delivery | Update reporting and audit without claiming final recipient delivery |
| \`EmailDeliveryFailed\` | Email Delivery | Classify failure, retry eligibility, fallback eligibility, and operations alert |
| \`EmailDeliveryOutcomeUnknown\` | Email Delivery | Block automatic fallback until reconciliation |
| \`ArtifactCreated\` | Artifact | Link evidence to source resource |
`,
);

nextArchitecture = replaceExactOrAlready(
  nextArchitecture,
  "| Email provider | Notification adapter | Controlled sender mailbox and provider acceptance response |",
  "| Outbound email providers | Email Delivery Engine | Generic SMTP first, runtime provider registry and routing, optional provider-specific adapters |",
  "architecture integration dependency",
);

nextArchitecture = replaceExactOrAlready(
  nextArchitecture,
  "- Notification module receives only rendered recipient and message data required for send",
  `- Notification module produces only the frozen provider-neutral message required for delivery
- Email Delivery module is the only business-runtime boundary allowed to resolve provider secret references and select transport adapters`,
  "architecture security boundary",
);

nextArchitecture = replaceExactOrAlready(
  nextArchitecture,
  "- Email service principal is scoped to the approved sender mailbox",
  "- Provider credentials and sender identities are scoped to the minimum approved outbound delivery capability",
  "architecture email principal",
);

nextArchitecture = replaceExactOrAlready(
  nextArchitecture,
  "| Reusable capabilities | Import, Approval, Notification, Scheduling, Artifact, Audit |",
  `| Reusable capabilities | Import, Approval, Notification, Email Delivery, Scheduling, Artifact, Audit |
| Initial email transport | Generic SMTP Adapter |
| Email provider selection | Dynamic provider registry and route configuration |
| Mandatory paid email provider | No |
| Email platform extraction | Only after a second production consumer and extraction criteria are satisfied |`,
  "architecture decision summary",
);

nextArchitecture = replaceSection(
  nextArchitecture,
  "## 15. Next Reference",
  `## 15. Next Reference

See \`plan.md\` for phased delivery, decision gates, and when each module becomes reusable beyond Public Holiday

See \`docs/EMAIL-DELIVERY-PLATFORM.md\` for the provider-neutral Email Delivery Engine, dynamic provider routing, safe fallback, and platform-extraction contract
`,
);

const emailReadmeSection = `## Email delivery direction

Email delivery is outside the current Phase 1 implementation

The planned Phase 3 design is provider-neutral:

- Generic SMTP is the first transport adapter
- Provider records and ordered routes are runtime configuration
- Provider adapter implementations remain trusted code
- SMTP-compatible providers can be switched without changing Public Holiday business logic when they use the same implemented SMTP adapter
- Provider-specific API adapters remain optional
- Microsoft Graph is not a required dependency
- No paid provider is mandatory in the architecture
- Automatic provider fallback is forbidden after provider acceptance or an unknown delivery outcome
- The delivery capability starts as a reusable module and becomes a shared Email Delivery Platform only after a second production consumer validates the contract

See \`docs/EMAIL-DELIVERY-PLATFORM.md\` for the detailed design
`;

if (!nextReadme.includes("## Email delivery direction")) {
  const browserHeading = "## Browser extension hydration warnings";
  if (!nextReadme.includes(browserHeading)) {
    throw new Error("README browser heading not found");
  }
  nextReadme = nextReadme.replace(
    browserHeading,
    `${emailReadmeSection}\n${browserHeading}`,
  );
}

nextReadme = replaceExactOrAlready(
  nextReadme,
  "See `architecture.md` and `plan.md` for the implementation boundaries and\ndelivery phases.",
  `See \`PROPOSAL.md\`, \`architecture.md\`, and \`plan.md\` for the client-facing solution,
implementation boundaries, and delivery phases.

Related contracts:

- \`docs/GOVERNED-IMPORT-CONTRACT.md\`
- \`docs/ACCESS-CONTROL.md\`
- \`docs/EMAIL-DELIVERY-PLATFORM.md\``,
  "README docs links",
);

const currentEmailDoc = fs.existsSync(FILES.emailDoc)
  ? fs.readFileSync(FILES.emailDoc, "utf8").replace(/\r\n/g, "\n")
  : null;

if (currentEmailDoc !== null && currentEmailDoc !== EMAIL_DOC) {
  throw new Error(
    `${FILES.emailDoc} already exists with different content`,
  );
}

const changed = new Map([
  [FILES.proposal, [proposal.text, nextProposal, proposal.eol]],
  [FILES.plan, [plan.text, nextPlan, plan.eol]],
  [FILES.architecture, [architecture.text, nextArchitecture, architecture.eol]],
  [FILES.readme, [readme.text, nextReadme, readme.eol]],
]);

const needsEmailDoc = currentEmailDoc === null;
const anyChanged =
  [...changed.values()].some(([before, after]) => before !== after) ||
  needsEmailDoc;

if (!anyChanged) {
  console.info("Email delivery platform documentation is already aligned; no files changed.");
  process.exit(0);
}

const backups = new Map();
for (const path of [...changed.keys(), FILES.emailDoc]) {
  backups.set(path, fs.existsSync(path) ? fs.readFileSync(path) : null);
}

try {
  for (const [path, [before, after, eol]] of changed) {
    if (before !== after) {
      writeWithEol(path, after, eol);
    }
  }

  if (needsEmailDoc) {
    fs.mkdirSync("docs", { recursive: true });
    fs.writeFileSync(FILES.emailDoc, EMAIL_DOC, "utf8");
  }

  execFileSync(
    "git",
    [
      "diff",
      "--check",
      "--",
      FILES.proposal,
      FILES.plan,
      FILES.architecture,
      FILES.readme,
      FILES.emailDoc,
    ],
    { stdio: "inherit" },
  );
} catch (error) {
  for (const [path, content] of backups) {
    if (content === null) {
      if (fs.existsSync(path)) fs.rmSync(path);
    } else {
      fs.writeFileSync(path, content);
    }
  }
  throw error;
}

console.info("Updated email delivery platform documentation:");
for (const [path, [before, after]] of changed) {
  if (before !== after) console.info(`  ${path}`);
}
if (needsEmailDoc) console.info(`  ${FILES.emailDoc}`);
console.info("Architecture/plan version: 0.3.17");
console.info("Proposal version: 0.2.1");
console.info("git diff --check for touched files: PASSED");
