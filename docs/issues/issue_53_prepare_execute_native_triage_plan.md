# Issue 53: Prepare/Execute + Native Triage Implementation Plan

Linked issue: `docs/issues/issue_53.md`  
Linked implementation plan: `docs/issues/issue_53_implementation_plan.md`  
Linked contracts: `docs/issues/issue_53_contracts.md`  
Linked operation tracker: `docs/issues/issue_53_operation_tracker.md`

## Codex Operational Policy

- All repository evidence presented in chat must be cited using relative repository paths.
- `docs/issues/issue_53_operation_tracker.md` must be used as the operational log: create/update an `OP-XXXX` entry before and after each meaningful operation, including files touched and evidence.
- Any operation that drifts, or may drift, from issue instructions must be explicitly disclosed in chat.
- Drift disclosures must identify:
  - the instruction being diverged from
  - why the divergence is necessary
  - expected impact/risk
  - whether execution paused for user confirmation or proceeded with rationale
- Any doubt, ambiguity, or contradiction in issue instructions must be surfaced to the user during operations.
- For high-impact or blocking ambiguity, Codex must ask before performing the operation.
- For low-impact ambiguity where operation proceeds, Codex must state the assumption and rationale immediately after the operation.

## 1) Purpose

- remove duplicated PDF triage/probe work in `pdfTriage=both`
- remove hidden heavy pre-lock work by making pre-execution work explicit

Non-negotiable correctness for native triage:

- do not downgrade certainty for the question: "is there selectable text?"
- no sampled-page negative claims as final truth

## 2) Confirmed Current Defects

1. Duplicate triage/probe work on `pdfTriage=both`:
- renderer performs two backend calls:
  - first call without preference
  - second call with `routePreference`

2. Heavy pre-lock work is hidden:
- PDF triage runs before processing mode enters
- user does not get processing lock/progress semantics during this stage

## 3) Scope

In scope:

- new backend split:
  - `prepareImportExtractSelectedFile`
  - `executePreparedImportExtract`
- new native triage method (real classification-only, not full extraction output)
- renderer flow update to call prepare once and execute once
- explicit pre-execution UI stage
- one-time prepared payload/token lifecycle
- logging and test updates
- hard cleanup/removal of previous single-call model code paths

Out of scope:

- changing overwrite/append/repetitions semantics
- changing OCR substrate/access model
- changing Issue 53 acceptance criteria outside this defect family
- page-sampled triage policy as final truth for native "no selectable text"

## 4) Target Flow

1. User selects file.
2. Renderer calls `prepareImportExtractSelectedFile`.
3. Backend performs route classification + PDF triage exactly once.
4. Backend returns:
- prepared id/token
- route metadata
- route-choice requirement and options (if needed)
5. Renderer prompts route choice only if required.
6. Renderer calls `executePreparedImportExtract(prepareId, routePreference?)`.
7. Backend enters processing mode at execute start and runs chosen route once.
8. Backend returns final extraction result for apply modal flow.

No second triage pass is allowed in execute.

## 5) New Native Triage Method

Name:

- `probeNativePdfSelectableText(...)`

Goal:

- answer triage-only question for native PDF availability
- do not generate final extraction payload

Required behavior:

1. Readability preflight:
- missing/non-file/access errors map explicitly

2. Parser viability check:
- parse PDF structure safely
- map encrypted/password-protected explicitly
- map unreadable/corrupt explicitly

3. Selectable-text determination:
- scan entire PDF for text-item presence
- allow early positive short-circuit (stop at first page with non-empty text item)
- negative is definitive only after full scan completes

4. Output shape:
- `state`: `success` or `failure`
- `selectableText`: `present` | `absent` | `unknown` (unknown reserved for explicit runtime interruption paths only)
- `error.code` when failure (`native_encrypted_or_password_protected`, `unreadable_or_corrupt`, `native_extraction_failed`, `aborted_by_user`)
- metadata safe for logs:
  - `pagesScanned`
  - `totalPages`
  - `foundAtPage` (nullable)
  - `elapsedMs`

Important:

- this probe is classification-only
- no full-text normalization pipeline output is produced

## 6) Prepare Contract (New IPC)

Channel:

- `import-extract-prepare-selected-file`

Input:

- `filePath`
- `ocrLanguage` (for consistency/context)

Output:

- `ok`
- `prepareId` (opaque, one-time token)
- `expiresAtEpochMs`
- `routeMetadata`:
  - `fileKind`
  - `availableRoutes`
  - `chosenRoute` (nullable for choice-required)
  - `pdfTriage`
  - `triageReason`
  - `ocrSetupState`
  - native probe metadata (safe only)
- `requiresRouteChoice`
- `routeChoiceOptions` when needed
- explicit alert keys for prepare-stage failures

Prepare-stage invariants:

- no processing-mode enter/exit in prepare
- no reuse of processing-mode lock/abort semantics for prepare
- no extraction result text returned by prepare
- no apply modal path from prepare

## 7) Execute Contract (New IPC)

Channel:

- `import-extract-execute-prepared`

Input:

- `prepareId`
- `routePreference` (optional; required when `both`)

Output:

- same final outer IPC success/failure envelope currently used by the execution path for post-route handling
  - preserve the current final-response transport shape (`ok`, `routeKind`, `result`, `routeMetadata`, `primaryAlertKey`, `warningAlertKeys`)
  - execute must not return only the raw extraction result payload
- route metadata with `executedRoute`

Execute-stage invariants:

- consumes one prepared record exactly once
- must fail explicitly on invalid/expired/reused `prepareId`
- no triage recomputation
- processing mode enters before route execution starts

## 8) Prepared Record Lifecycle

Store:

- in-memory map in backend module scope

Record fields:

- `prepareId`
- `createdAtEpochMs`
- `expiresAtEpochMs`
- `sourceFileFingerprint` (`path`, `size`, `mtimeMs`)
- triage decision payload (native probe/OCR readiness result, metadata)
- `requiresRouteChoice`, options

Rules:

- TTL: short (for example 2 minutes)
- one-time consume on execute
- periodic cleanup of expired records
- file fingerprint mismatch at execute -> explicit invalidation error

## 9) Renderer/UI Changes

Renderer orchestration:

- replace direct `runImportExtractSelectedFile` with:
  - `prepareImportExtractSelectedFile`
  - optional route-choice modal
  - `executePreparedImportExtract`

Prepare UI state:

- explicit user-visible "preparing import/extract route" status
- must not pretend execution is running
- must remain outside processing mode and must not block the UI as if extraction/OCR execution were already active
- must handle cancellation/close safely

Prepare in-flight / stale-request guard:

- use a lightweight prepare-stage race guard in renderer orchestration; do not reuse processing-mode locking for this
- only the latest prepare attempt may continue to route-choice or execute
- stale prepare completions must be ignored locally
- after OCR activation recovery or any route-affecting state change, rerun prepare and discard any older prepared id

Execute UI state:

- unchanged processing mode semantics for lock/abort

## 10) Observability and Logs

Add structured events:

- `import/extract prepare started`
- `import/extract prepare completed`
- `import/extract prepare failed`
- `import/extract prepare choice-required`
- `import/extract execute started`
- `import/extract execute completed`
- `import/extract prepared id invalid/expired/reused`

Required fields:

- `prepareId` (or hashed/short id safe for logs)
- `sourceFileExt`, `sourceFileKind`
- `pdfTriage`, `triageReason`
- `availableRoutes`, `chosenRoute`, `executedRoute`
- native probe metadata (`pagesScanned`, `totalPages`, `foundAtPage`, `elapsedMs`)
- OCR setup state in prepare

No silent fallback logs remain mandatory.

## 11) Verification Plan

Must-pass checks:

1. `pdfTriage=both`:
- exactly one prepare triage pass
- exactly one execute route run
- no second triage call

2. Hidden-work defect:
- user sees explicit prepare stage while triage runs

3. Certainty preservation:
- native negative (`no selectable text`) only after full scan (not sampled negative)

4. Invariants:
- no partial text/apply modal on failure/cancel
- close-during-processing behavior unchanged

5. Regression:
- non-PDF flows unchanged
- apply semantics unchanged

6. Logging:
- required prepare/execute events and metadata present

## 12) Implementation Sequence

Execution phases:

- Phase 1: backend/core split
  - native triage probe
  - prepared-record store
  - prepare IPC
  - execute IPC
  - main/preload wiring
- Phase 2: renderer cutover + cleanup
  - renderer prepare -> route choice -> execute flow
  - prepare-stage UI + stale-request guard
  - OCR activation recovery adaptation
  - removal of superseded single-call IPC/bridge/i18n code

1. Add native triage probe module (`probeNativePdfSelectableText`).
2. Add prepare IPC module + prepared-record store.
3. Add execute IPC module consuming prepare record.
4. Wire new IPCs in `electron/main.js` + `electron/preload.js`.
5. Update renderer flow to prepare -> route choice -> execute.
6. Add explicit prepare-stage UI messaging.
7. Add/adjust i18n keys for prepare-stage statuses/errors.
8. Add tests/harness probes for duplicate-triage prevention.
9. Run lint/syntax checks and manual validation matrix.
10. Update operation tracker evidence and close with metrics.
11. Remove superseded legacy execution model artifacts and dead i18n/bridge code.

## 13) Drift Guardrails

- No fallback to sampled-page negative certainty.
- No reintroduction of duplicated triage in renderer.
- No hidden prepare-stage behavior.
- No changes to canonical apply semantics.
- Important: No legacy model remnants, dead code or fallback to that old model. Final code should look like the old model was never there and this new implementation was there from the begining.
