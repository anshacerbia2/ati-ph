# Governed Public-Holiday Import Contract

| Metadata | Value |
| --- | --- |
| Status | Implemented ingestion baseline |
| Version | 1.8.1-draft |
| Date | 2026-08-17 |
| Schema name | `ati-public-holiday-import` |
| Legacy schema version | `legacy-1.0` |
| Required legacy sheet | `Holiday_Master` |

## Purpose

This contract defines the safe boundary between an uploaded workbook and ATI PH staging. PostgreSQL is canonical; Excel is input evidence. Upload never publishes holiday data, schedules notifications, or sends email.

The supplied `ModifByRF-FCTG-Master Data Template - PH Notifications.xlsx` workbook was audited structurally and visually. It contains seven sheets, but only `Holiday_Master` is ingested by this slice. `Client_Master`, templates, error evidence, glossary, and backup data will use separate migration or domain contracts.

## Accepted file envelope

- File extension must be `.xlsx`
- MIME type must be the standard XLSX type or `application/octet-stream`
- Size must not exceed `IMPORT_MAX_FILE_SIZE_BYTES`
- Package must have a valid ZIP signature and CRC
- Encrypted, corrupt, macro-enabled, and VBA-containing packages are rejected
- Byte-identical XLSX evidence hard-blocks with `EXACT_FILE_DUPLICATE`; normal imports have no confirmation override
- Different XLSX bytes with the same canonical authoritative `Holiday_Master` business content hard-block with `SAME_HOLIDAY_DATA` when an existing batch is `UPLOADED`, `VERIFYING`, or `VALIDATED`
- Duplicate preflight completes before raw artifact or import-batch persistence, so a blocked duplicate creates no new evidence record or batch
- Accepted original bytes are stored under a new immutable artifact key

## Legacy header mapping

Column order is ignored. Header comparison is case-insensitive and punctuation-insensitive.

| Canonical field | Accepted legacy headers | Required |
| --- | --- | --- |
| `regionCode` | `Region`, `Region Code`, `Calendar Region` | Yes |
| `holidayName` | `PH Name`, `Holiday Name`, `Public Holiday` | Yes |
| `startDate` | `PH Start Date`, `Start Date` | Yes |
| `endDate` | `PH End Date`, `End Date` | Yes |
| `sourceRowId` | `Source Row ID` | No |
| `sourceReference` | `Source Reference` | No |
| `notes` | `Remarks`, `Notes` | No |

Unknown columns remain in `rawData`. `Source Row ID` is no longer canonical workbook input; if an older workbook still contains that column it is retained only in immutable raw evidence and is ignored by normalization. More than one source column mapping to the same canonical field is an error. Missing required headers make the batch invalid.

## Normalization rules

- Whitespace is trimmed without changing immutable raw evidence
- Comma, semicolon, and newline-separated legacy regions are split
- Region aliases resolve through the database-managed calendar-region registry; only active aliases owned by active regions are accepted
- The bootstrap registry contains canonical codes `AU`, `ID`, `GB`, `ZA`, `NA`, `NZ`, and `SG`; administrators can govern aliases without redeploying the application
- Duplicate region codes within one source row are collapsed
- Holiday names retain display text and also receive a normalized duplicate-matching value
- Typed Excel dates and ISO `YYYY-MM-DD` text are accepted
- Formula cells are preserved in raw JSON but cannot supply region, name, or date authority
- `Day` and `Tag` are preserved only in raw JSON; canonical publication will derive them per calendar date
- `Remarks` is informational and never controls workflow state

## Validation result

Issues use stable severity and code values:

- `ERROR` blocks validation/publication
- `WARNING` requires review and later acknowledgement
- `INFO` records deterministic normalization

Implemented codes include:

- `MISSING_REQUIRED_HEADER`
- `AMBIGUOUS_HEADER`
- `REQUIRED_VALUE_MISSING`
- `UNKNOWN_REGION`
- `INVALID_DATE`
- `END_DATE_BEFORE_START_DATE`
- `DATE_PERIOD_TOO_LONG`
- `CROSS_YEAR_PERIOD`
- `FORMULA_NOT_ALLOWED`
- `SAMPLE_ROW_DETECTED`
- `DUPLICATE_HOLIDAY_OCCURRENCE`
- `OVERLAPPING_HOLIDAY_OCCURRENCE`
- `MULTI_REGION_NORMALIZED`
- `LEGACY_SCHEMA_ASSUMED`
- `DERIVED_COLUMNS_IGNORED`

Sample/test rows produce warnings in development and errors in production. Unknown regions always produce errors.

## Persistence and transaction boundary

Submit preflight validates the XLSX package and workbook contract, resolves active calendar-region aliases, parses only `Holiday_Master` for business duplicate identity, and computes `businessContentSha256` before persistence.

The raw artifact is written only after exact-file, business-content, preview-contract, and blocking-validation gates pass. The database transaction then acquires a PostgreSQL advisory lock derived from `businessContentSha256` when available, otherwise `fileSha256`, rechecks exact and business duplicate identity, and creates:

- `file_artifacts`
- `import_batches`
- `import_rows`
- `import_validation_issues`
- the upload `audit_events` record

The worker later performs independent authoritative verification and emits `ImportBatchValidated` only after the stored raw workbook has been reparsed successfully.

If the transaction fails or a concurrent duplicate wins the lock, only the not-yet-registered file is removed. Registered artifacts are never overwritten.

## Evidence retrieval

Users with the ATI PH `import.read` permission can retrieve evidence for an existing batch:

- The validation report is generated deterministically from persisted batch metadata and the complete `import_validation_issues` set as UTF-8 CSV
- The original workbook download reads only the registered raw artifact storage key
- Raw bytes are SHA-256 verified against `file_artifacts.sha256` before release
- A storage-provider mismatch, missing file, or hash mismatch fails closed
- Validation-report and raw-workbook downloads each write an audit event before release
- Responses are private, non-cacheable attachments and are served with `X-Content-Type-Options: nosniff`

## Controlled staging correction

- Raw workbook bytes and `rawData` remain immutable evidence
- Operator/Administrator correction writes only `normalizedData`, editor identity, and edit timestamp
- Governed editable fields are Revision ID, canonical region codes, holiday name, start date, end date, source reference, and notes
- Revision ID is application-owned staging state, never workbook authority
- The operator-facing Revision ID field is empty by default for a new holiday
- Internally, a new staging row uses `revisionId = import_rows.id` as a sentinel so existing publication and idempotency invariants remain unchanged; that sentinel is not prefilled or shown as a revision target in the UI
- To revise a published row, the operator copies the target `holiday_occurrences.id` from Published lineage and enters it as Revision ID
- Revision targets must exist, must not already be superseded, and must not have crossed the notification cancellation boundary
- Region correction accepts active canonical region codes only; free-form aliases are not persisted as normalized authority
- Exclusion requires an explicit reason and changes the row to `EXCLUDED`
- Restoration removes the exclusion reason and re-enters deterministic validation
- Every correction, exclusion, or restoration revalidates the complete non-excluded batch so duplicate and overlap rules cannot become stale
- Existing warning acknowledgements survive revalidation only when the regenerated warning has the same stable issue identity; changed warnings require acknowledgement again
- Row status, batch counts/status, regenerated row issues, audit event, and validation-state outbox transition commit transactionally
- Submitted or published batches are frozen against staging mutation

## Client preprocessing and authoritative verification

- File selection does not upload immediately
- The browser dynamically loads SheetJS and parses `Holiday_Master` locally using the governed mapping and normalization rules
- The user sees normalized rows, canonical region resolution, dates, row status, warnings, and errors before submission
- Browser preprocessing is advisory and cannot authorize approval or publication
- On confirmation the browser submits the untouched XLSX plus the complete preview JSON
- Before persistence, the API synchronously validates XLSX package safety and workbook contract, treats `Holiday_Master` as the only business-data sheet, resolves active region aliases, computes `businessContentSha256`, and applies exact plus business duplicate hard-blocks
- This synchronous server parse exists only to enforce the submit boundary and duplicate identity; it does not make browser staging authoritative
- After duplicate and preview gates pass, the API stores raw XLSX evidence immutably, stores provisional preview rows and issues, records `fileSha256`, `businessContentSha256`, and `clientPreviewSha256`, and returns `UPLOADED`
- `UPLOADED` and `VERIFYING` batches cannot be corrected, acknowledged, submitted for approval, approved, or published
- The worker claims pending batches as `VERIFYING`; stale verification claims are retryable
- The worker verifies ZIP integrity and rejects macro-enabled packages before parsing
- The worker independently reparses the stored XLSX with SheetJS, recomputes `businessContentSha256`, and recomputes the deterministic preview fingerprint
- Preview fingerprint mismatch fails the batch closed as `FAILED`
- A matching worker parse replaces provisional row and issue values with the authoritative result and transitions the batch to `VALIDATED` or `INVALID`
- Only worker-verified staging participates in maker-checker approval and canonical publication

## Maker-checker approval

- Submission is allowed only for a `VALIDATED` batch with at least one valid row, zero invalid rows, zero `ERROR` issues, and every `WARNING` acknowledged
- Submission creates a reusable `approval_requests` record and stores a deterministic SHA-256 hash over normalized row content, row status/exclusion state, validation evidence, and warning acknowledgement state
- `import_batches.submittedAt` freezes normalized staging and warning acknowledgement while the request is pending or approved
- A user with `import.approve` must be different from the requester
- Decision recomputes the frozen content hash and fails closed on mismatch
- Approval remains frozen for canonical publication
- Rejection requires a reason, clears `submittedAt`, and returns the batch to controlled correction/resubmission
- Request and decision audit events plus outbox events commit in the same transaction as approval state

## Canonical holiday publication

- Publication requires a frozen batch with an `APPROVED` maker-checker request whose SHA-256 content hash still matches current staging and validation evidence
- Only `VALID` rows publish; `EXCLUDED` rows remain source evidence but never create canonical holiday data
- Each valid source row creates one new `holiday_occurrences` record linked by immutable `sourceImportRowId` and `sourceImportBatchId`
- First publication uses `holiday_occurrences.id = import_rows.id`; Published lineage exposes that occurrence ID with an explicit copy action for future governed revision
- When Revision ID points to another current published occurrence, publication creates a new occurrence, sets `supersedesOccurrenceId`, and marks the old occurrence `supersededAt`
- A superseded occurrence remains historical and is never overwritten
- Publication rechecks revision eligibility inside the serializable transaction before changing canonical state
- `notificationCommittedAt` is the fail-closed cancellation boundary for future delivery integration; once populated, normal revision is blocked and a separate correction-after-send workflow is required
- The normalized holiday identity upserts a `holiday_definitions` record without mutating existing canonical history
- Every normalized canonical region creates one `holiday_occurrence_regions` relation; inactive or missing canonical regions fail publication closed
- Start/end periods expand inclusively into `holiday_occurrence_dates`
- `dayOfWeek` and `dayType` (`WEEKDAY` or `WEEKEND`) are derived from each canonical date; legacy Excel `Day` and `Tag` are never publication authority
- The publication transaction is serializable and atomically writes canonical rows, `import_batches.publishedAt`, audit evidence, and the `HolidayCalendarPublished` outbox event
- A second publish call for an already-published batch returns the existing publication summary without duplicating canonical records
- `sourceImportRowId` is unique in canonical occurrences, providing an additional database idempotency barrier
- The batch review UI exposes source-row to canonical-occurrence, region, and expanded-date lineage

## Warning acknowledgement

- Only persisted `WARNING` issues can be acknowledged
- `ERROR` remains blocking and cannot be acknowledged away
- Operator/Administrator access uses the existing `import.create` permission; read-only roles can inspect acknowledgement state
- Acknowledgement stores the acting ATI PH user and timestamp
- Reversal is explicit and audited
- Acknowledgement and its audit event commit in the same PostgreSQL transaction

## Source-workbook verification

The current workbook produced this deterministic result:

| Metric | Result |
| --- | ---: |
| Holiday rows | 25 |
| Valid production-like rows | 22 |
| Invalid rows | 3 |
| Multi-region rows normalized | 16 |
| Invalid-row reason | `(SAMPLE)` rows using unapproved `xxx` region values |

This is an ingestion result, not business-owner sign-off on the holidays themselves.

## Remaining Phase 1 work

- End-to-end worker verification smoke, including exact-byte and metadata-independent `Holiday_Master` duplicate cases
- Business-owner acceptance of the canonical publication result and mounted ATI One smoke verification

## Remaining Phase 1 acceptance

- End-to-end worker verification smoke, including one `EXACT_FILE_DUPLICATE` case and one byte-different `SAME_HOLIDAY_DATA` case
- Mounted ATI One smoke verification and business-owner acceptance of the canonical publication result

<!-- ATI_PH_IMPORT_FLOW_START -->
## Governed import processing flow

This section defines what happens from local workbook preview through duplicate preflight, evidence, worker verification, review, approval, and canonical publication.

```mermaid
flowchart TD
    A[User selects XLSX] --> B[Browser parses Holiday_Master]
    B --> C[Normalize + preliminary validation]
    C --> D[Local preview]
    D -->|Blocking ERROR| E[Submit disabled]
    D -->|Valid| F[User confirms submit]

    F --> G[POST raw XLSX + complete preview JSON]
    G --> H[Calculate fileSha256<br/>entire XLSX bytes]
    H --> I{Exact fileSha256 exists?}
    I -->|Yes| I1[409 EXACT_FILE_DUPLICATE<br/>no persistence]
    I -->|No| J[Server XLSX safety + contract check<br/>Holiday_Master business parse]

    J --> K[Normalize authoritative business fields<br/>using active region aliases]
    K --> L[Calculate businessContentSha256]
    L --> M{Same Holiday_Master business hash<br/>in UPLOADED / VERIFYING / VALIDATED?}
    M -->|Yes| M1[409 SAME_HOLIDAY_DATA<br/>no persistence]
    M -->|No| N[Validate client preview contract<br/>and blocking errors]

    N --> O[Store immutable raw artifact]
    O --> P[file_artifacts]
    P --> Q[Transaction advisory lock<br/>recheck exact + business duplicates]
    Q --> R[Create import batch<br/>status UPLOADED]
    R --> S[import_batches]

    S --> T[Store provisional rows]
    T --> U[import_rows]
    S --> V[Store provisional issues]
    V --> W[import_validation_issues]

    S --> X[Worker claims batch]
    X --> Y[status VERIFYING]
    Y --> Z[Read immutable raw XLSX]
    Z --> AA[XLSX package + security checks]
    AA --> AB[Independent SheetJS parse]
    AB --> AC[Authoritative normalization + validation]

    AC --> AD[Recompute businessContentSha256<br/>and worker preview fingerprint]
    AD --> AE{Matches clientPreviewSha256?}
    AE -->|No| AF[FAILED<br/>integrity mismatch]
    AE -->|Yes| AG[Replace provisional staging<br/>with authoritative worker result]

    AG --> AH[Update row and issue aggregates]
    AH --> AI[VALIDATED or INVALID]

    AI --> AJ[Review workspace]
    AJ --> AK[Correction / exclusion / restore]
    AJ --> AL[Warning acknowledgement]
    AK --> AM[Recompute review state]
    AL --> AM

    AM --> AN[Submit for approval]
    AN --> AO[approval_requests]
    AO -->|Rejected| AP[Rejected]
    AO -->|Approved by different user| AQ[Publish]

    AQ --> AR[holiday_definitions]
    AQ --> AS[holiday_occurrences]
    AS --> AT[holiday_occurrence_regions]
    AS --> AU[holiday_occurrence_dates]
    AQ --> AV[audit_events]
    AQ --> AW[outbox_events]
```

### Persistence by stage

| Stage | Table / storage | What is stored |
| --- | --- | --- |
| Local preview | None | Parsed rows, normalized values, and preliminary issues remain in browser memory only |
| Duplicate preflight | None | `fileSha256`, server-parsed canonical `Holiday_Master` business identity, and blocking checks; duplicates stop before persistence |
| Raw evidence | Artifact storage + `file_artifacts` | Original accepted XLSX bytes in artifact storage; filename, MIME type, size, SHA-256, storage key, retention class, creator, timestamp in DB |
| Import root | `import_batches` | One row per accepted unique submission: batch number, source/schema, raw artifact reference, `fileSha256`, `businessContentSha256`, `clientPreviewSha256`, status, row aggregates, uploader, verification/publication timestamps, failure reason |
| Staging | `import_rows` | One row per source row: system-owned Revision ID, raw data, normalized data, row status, exclusion state, edit actor and timestamps |
| Validation | `import_validation_issues` | ERROR/WARNING/INFO, code, field, rejected value, message, acknowledgement actor and timestamp |
| Reference resolution | `calendar_regions`, `calendar_region_aliases` | Canonical region registry used during normalization and validation |
| Approval | `approval_requests` | Frozen approval content hash, requester, approver, decision status, timestamps, reason |
| Publication | `holiday_definitions`, `holiday_occurrences`, `holiday_occurrence_regions`, `holiday_occurrence_dates` | Canonical holiday definitions, occurrences, region links, and expanded calendar dates |
| Traceability | `audit_events`, `outbox_events` | User/system actions and integration events |

### Import batch boundary

One accepted unique workbook creates one `import_batches` row. A workbook blocked as `EXACT_FILE_DUPLICATE` or `SAME_HOLIDAY_DATA` creates no new artifact and no new import batch.

```text
1 accepted unique XLSX
  -> 1 file_artifacts record for the raw evidence
  -> 1 import_batches root record
  -> N import_rows
  -> N import_validation_issues
  -> 0..1 active approval lifecycle
  -> N published holiday occurrences

blocked duplicate XLSX
  -> 0 new file_artifacts
  -> 0 new import_batches
```

The original XLSX is evidence. The import batch is the governed processing snapshot for an accepted unique submission.

### Hash responsibilities

| Hash | Scope | Purpose |
| --- | --- | --- |
| `fileSha256` | Entire raw XLSX byte stream | Detect exact binary re-upload, identify immutable file evidence, and hard-block `EXACT_FILE_DUPLICATE` |
| `clientPreviewSha256` | Deterministic complete browser preview payload | Verify browser preview against the worker's independent parse |
| approval `contentHash` | Frozen reviewed staging state | Ensure the content approved is the content later published |
| `businessContentSha256` | Canonical normalized authoritative `Holiday_Master` business content | Hard-block semantically identical holiday datasets across byte-different workbooks and retain a worker-recomputed business fingerprint |

`businessContentSha256` is computed synchronously during submit preflight from the server's `Holiday_Master` parse, persisted on an accepted batch, and independently recomputed by the worker from immutable raw XLSX evidence. It is nullable when complete publishable business content cannot be formed. It does not replace `fileSha256`, `clientPreviewSha256`, or approval `contentHash`.

The business hash contains only canonical region codes, normalized holiday name, start date, and end date. Region codes and rows are deterministically deduplicated/sorted before hashing. It intentionally excludes workbook metadata, filename, formatting, row position, source row ID, source reference, remarks/notes, legacy `Day`/`Tag`, and every sheet other than `Holiday_Master`.

### Duplicate semantics

```text
same fileSha256
  -> 409 EXACT_FILE_DUPLICATE
  -> no new artifact or batch

different fileSha256
same businessContentSha256 as an UPLOADED / VERIFYING / VALIDATED batch
  -> 409 SAME_HOLIDAY_DATA
  -> no new artifact or batch

different businessContentSha256
  -> materially different business import
  -> may proceed subject to normal validation
```

Removing `_ATI_PH_META`, renaming the workbook, changing Excel formatting, reordering rows, or adding/removing unrelated sheets does not create a new holiday dataset when canonical authoritative `Holiday_Master` content is unchanged. The normal import flow has no `confirmDuplicate` or semantic-duplicate override; any future reprocessing capability must be a separate governed/admin recovery flow.

### Review and publication invariant

Review operates on the same governed import aggregate; it does not create a second copy of the dataset.

```text
import_batches
  + import_rows
  + import_validation_issues
        |
        v
      review
        |
        v
approval_requests
        |
        v
canonical publication
```

Published occurrences retain source import references so canonical holiday data remains traceable back to the import batch and source row.
<!-- ATI_PH_IMPORT_FLOW_END -->

### Governed workbook metadata

Official ATI-PH templates include a worksheet named `_ATI_PH_META`.

| Key | Required value |
| --- | --- |
| `schema_name` | `ati-public-holiday-import` |
| `schema_version` | `1.0` |
| `template_type` | `PUBLIC_HOLIDAY_IMPORT` |
| `data_sheet` | `Holiday_Master` |

The metadata worksheet identifies the workbook contract and schema version. It is not an authenticity or security boundary; the server still independently reparses and validates the raw workbook. `_ATI_PH_META` is excluded from `businessContentSha256`, so adding or removing the metadata sheet cannot by itself create a distinct holiday business dataset.

Legacy workbooks without `_ATI_PH_META` remain supported. The parser records this as informational compatibility evidence (`LEGACY_SCHEMA_ASSUMED`) rather than a warning. If the metadata worksheet is present but contains an unsupported or contradictory contract value, parsing fails closed. A governed workbook and a supported legacy workbook with the same canonical authoritative `Holiday_Master` content therefore resolve to the same business duplicate identity.

Official files:

- `docs/ATI-PH-Import-Template-Governed.xlsx`
- `docs/ATI-PH-Example-Import-Governed.xlsx`
