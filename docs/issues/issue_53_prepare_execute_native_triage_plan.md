# Issue 53: Prepare/Execute + Native Triage Implementation Plan

Linked issue: `docs/issues/issue_53.md`  
Linked implementation plan: `docs/issues/issue_53_implementation_plan.md`  
Linked contracts: `docs/issues/issue_53_contracts.md`  
Linked operation tracker: `docs/issues/issue_53_operation_tracker.md`

## 1) Purpose

Implement Option 2 (`prepare` then `execute`) to fix both confirmed defects without weakening triage correctness:

- remove duplicated PDF triage/probe work in `pdfTriage=both`
- remove hidden heavy pre-lock work by making pre-execution work explicit
- perform a hard cutover to the new model with no legacy/fallback remnants

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
- new native triage method (classification-only, not full extraction output)
- renderer flow update to call prepare once and execute once
- explicit pre-execution UI stage
- explicit renderer prepare-state lifecycle (separate from processing-mode lock lifecycle)
- one-time prepared payload/token lifecycle
- logging and test updates
- hard cleanup/removal of previous single-call model code paths
- OCR activation recovery path migration to prepare/execute (no runtime fallback to legacy single-call path)

Out of scope:

- changing overwrite/append/repetitions semantics
- changing OCR substrate/access model
- changing Issue 53 acceptance criteria outside this defect family
- page-sampled triage policy as final truth for native "no selectable text"
- compatibility fallback to the legacy single-call execution model

## 4) Target Flow

1. User selects file.
2. Renderer calls `prepareImportExtractSelectedFile`.
3. Backend performs route classification + PDF triage exactly once.
4. Backend returns:
- prepared id/token (`preparedId`)
- route metadata
- route-choice requirement and options (if needed)
5. Renderer prompts route choice only if required.
6. Renderer calls `executePreparedImportExtract(preparedId, routePreference?)`.
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
- negative is definitive only after full-page scan completes

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
- `preparedId` (opaque, one-time token)
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
- no extraction result text returned by prepare
- no apply modal path from prepare

## 7) Execute Contract (New IPC)

Channel:

- `import-extract-execute-prepared`

Input:

- `preparedId`
- `routePreference` (optional; required when `both`)

Output:

- same final extraction result contract currently used by execution path
- route metadata with `executedRoute`

Execute-stage invariants:

- consumes one prepared record exactly once
- must fail explicitly on invalid/expired/reused `preparedId`
- no triage recomputation
- processing mode enters before route execution starts

## 8) Prepared Record Lifecycle

Store:

- in-memory map in backend module scope

Record fields:

- `preparedId`
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
- migrate OCR activation recovery retry path to re-enter prepare/execute orchestration (no direct retry against legacy single-call runtime IPC)

Prepare UI state:

- explicit user-visible "preparing import/extract route" status
- must not pretend execution is running
- must use renderer-local prepare state and messaging, not processing-mode lock state
- must not show processing lock/abort controls during prepare
- must handle cancellation/close safely

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

- `preparedId` (or hashed/short id safe for logs)
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

7. OCR activation recovery alignment:
- when OCR activation succeeds after a prepare/execute failure path, retry must go through prepare/execute
- no direct recovery retry call to legacy single-call runtime channel

8. Prepare-state UX:
- prepare stage is visible and distinct from processing lock stage
- abort button semantics remain bound to execute/processing mode only

## 12) Implementation Sequence

1. Add native triage probe module (`probeNativePdfSelectableText`).
2. Add prepare IPC module + prepared-record store.
3. Add execute IPC module consuming prepare record.
4. Wire new IPCs in `electron/main.js` + `electron/preload.js`.
5. Update renderer flow to prepare -> route choice -> execute.
6. Add explicit prepare-stage UI messaging.
7. Add/adjust i18n keys for prepare-stage statuses/errors.
8. Add tests/harness probes for duplicate-triage prevention.
   - current repository baseline: no formal automated test suite is currently wired as a required gate; use focused checks + manual matrix evidence until a fuller harness is added
   - minimum concrete strategy for this repository:
     - add deterministic backend unit-style checks for prepare-record lifecycle (create/consume/expire/reuse rejection/fingerprint mismatch)
     - add deterministic backend checks for "prepare triage once, execute no retriage" behavior
     - add renderer-level orchestration checks for `prepare -> optional route choice -> execute` and prepare-stage UI messaging
     - maintain manual smoke matrix evidence in operation tracker for end-to-end flows not yet covered by automated harness
9. Run lint/syntax checks and manual validation matrix.
10. Update operation tracker evidence and close with metrics.
11. Remove superseded legacy execution model artifacts and dead i18n/bridge code.

## 13) Drift Guardrails

- No fallback to sampled-page negative certainty.
- No reintroduction of duplicated triage in renderer.
- No hidden prepare-stage behavior.
- No changes to canonical apply semantics.
- No compatibility fallback to `import-extract-run-selected-file`.
- No legacy "dual-call route-choice on one IPC" path retained behind flags.

## 14) Hard Cutover Cleanup Requirements

Non-negotiable cleanup requirement:

- after migration, only prepare/execute channels remain for import/extract runtime flow.

Must remove or refactor all legacy-model remnants:

1. IPC and preload:
- remove direct renderer usage of legacy single-call channel for import/extract runtime execution.
- remove obsolete preload bridge entries tied only to the legacy runtime path.

2. Backend execution path:
- remove legacy route-choice handshake behavior that depends on returning `requiresRouteChoice` from the old single-call runtime endpoint.
- remove dead triage/execute coupling branches that only existed to support the second legacy call.

3. Renderer orchestration:
- remove old two-call orchestration branches (`first call -> modal -> second call`) from active path.
- keep only `prepare -> route choice (if required) -> execute`.
- remove legacy OCR setup recovery retry branches that call the single-call runtime endpoint directly.

4. Localization and alerts:
- remove dead alert keys/messages that are only reachable from removed legacy paths.
- keep/add prepare-stage status keys required by the new prepare-state UI.

5. Verification gate before closure:
- `rg` check confirms no active runtime references remain to the legacy single-call import/extract flow.
- manual flow confirms no hidden fallback to old model occurs when prepare/execute path fails.
