# Issue 53 Implementation Plan

Linked issue: `docs/issues/issue_53.md`
Linked operation tracker: `docs/issues/issue_53_operation_tracker.md`
Linked contracts: `docs/issues/issue_53_contracts.md`

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

## 1. Substrate and access-model decision

- [x] Evaluate substrate options, starting with Google Document AI as the primary candidate.
- [x] Compare OCR quality (especially photographed book pages), language coverage, PDF support, setup burden, cost, Windows-first delivery fit, and cross-platform architectural viability.
- [x] Evaluate the OCR access / billing / activation model for distributed app delivery alongside substrate evaluation:
  - vendor-managed
  - user-managed
  - hybrid/optional
- [x] Decide substrate and access model, and record rationale + known constraints that will affect downstream implementation.

## 2. Substrate setup / billing / activation path

- [x] Complete developer-side installation/activation for the chosen substrate.
  - Owner: `User manual` with Codex guidance.
  - Done when:
    - system-browser OAuth sign-in succeeds for the desktop client.
    - developer-side flow validates with local harness (`tools_local/drive_ocr_test/index.js`).
- [x] Configure credentials/secrets and required auth/billing setup for the chosen substrate and chosen access model.
  - Owner: `User manual` with Codex guidance.
  - Done when:
    - Google Drive API is enabled for the selected Google Cloud project.
    - desktop OAuth client credentials are downloaded and stored in a local non-repo path.
    - test-user / consent configuration allows successful sign-in for development validation.
- [x] Define ownership/storage boundary for controlling credentials/configuration.
  - Owner: `Codex` (implementation + docs).
  - Done when:
    - app/client credentials are never embedded in tracked source files.
    - user OAuth tokens are stored locally and outside repository-tracked paths.
    - explicit disconnect/local-token-removal ownership is documented.
    - canonical app runtime path is `app.getPath('userData')/config/ocr_google_drive/`:
      - `credentials.json` (user-provided OAuth client credentials file; not deleted by app disconnect flows)
      - `token.json` (user OAuth token state; removed on disconnect)
- [x] Define whether OCR is enabled by default or requires explicit activation, and how availability is determined.
  - Owner: `Codex` (implementation + docs).
  - Done when:
    - default state is OCR disabled.
    - availability requires explicit successful activation/sign-in.
    - unavailable/not-activated states are explicitly detectable and user-visible.
    - baseline availability determination is locked:
      - `setup_incomplete` when `credentials.json` is missing
      - `ocr_activation_required` when `token.json` is missing
      - available only when both files are present under `app.getPath('userData')/config/ocr_google_drive/`
      - first successful sign-in creates local token state for reuse; subsequent files/sessions for the same user do not require re-auth unless token state is missing/invalid/revoked or scope changes
- [x] Define usage restrictions/limits, if any, and how they are enforced.
  - Owner: `Codex` (implementation + docs).
  - Done when:
    - restrictions list is documented (format/routing/activation constraints).
    - enforcement points are defined (preflight and runtime).
    - restriction failures map to explicit user-visible states and logs.
    - policy decision: no additional app-imposed hard limits at this phase (no custom max file-size/page-count caps yet).
    - enforced restrictions currently come from:
      - route/file-kind/format classification rules
      - setup/activation availability gates
      - provider/API runtime constraints surfaced explicitly (no silent fallback)
- [ ] Define quota/budget/usage-limit handling for the chosen model.
  - Owner: `Codex` (implementation + docs).
  - Done when:
    - quota/limit failures map to `billing_or_quota_limited` (or narrower mapped state with equivalent explicitness).
    - user guidance for retry/wait/reconnect actions is defined.
    - no quota/limit path degrades into silent fallback.
- [ ] Add setup validation flow and explicit user-visible errors for incomplete/missing setup, missing credentials, billing/auth issues, and quota/budget/usage-limit issues.
  - Owner: `Codex` + `User` (manual validation run).
  - Done when:
    - validation checks credentials presence, activation status, and reachable API path.
    - each setup/auth/quota category has explicit user-visible failure handling.
    - failure categories are logged with structured details safe for logs.
- [ ] Confirm setup path and failures follow current logging/bridge-failure policies.
  - Owner: `Codex`.
  - Done when:
    - setup and activation paths follow existing warn/error conventions in `log.js` style.
    - optional bridge failures are non-crashing and explicit; required-path failures are explicit and blocking.
    - evidence is captured in Issue 53 tracker before Section 4 coding starts.

## 3. Contracts before implementation

- [x] Define shared extraction result contract for all routes:
  - success/failure
  - extracted text
  - executed route
  - warnings/summary
  - safe provenance metadata
  - structured error on failure
- [x] Define route metadata contract:
  - detected file kind
  - available routes
  - chosen route
  - executed route
  - PDF triage status
- [x] Lock apply contract: extraction post-apply must reuse the existing canonical overwrite/append/repetitions path (including MAX_TEXT_CHARS + explicit truncation behavior).
- [x] Lock state taxonomy for behavior/logging distinction:
  - precondition rejected (blocked start)
  - extraction failure (after start)
  - user cancellation/abort
- [x] Lock processing-mode contract:
  - processing lock is distinct from startup lock
  - while processing, main window/app menu interactions are blocked except close/minimize/move/abort
  - close-window request during processing follows cancellation semantics (same guarantees as abort)

## 4. Basic implementation

- [ ] Add dedicated import/extract button in the text-selector row.
- [ ] Implement file picker open behavior (default folder first, then persisted folder).
- [ ] Implement precondition block (no start when secondary windows are open or stopwatch is running) with explicit user guidance.
- [ ] Isolate Windows-specific implementation behind platform adapters so core extraction/apply orchestration remains OS-agnostic for future macOS/Linux support.
- [ ] Implement processing mode as a distinct lock state (not startup lock) and block normal main-window/menu interactions while active.
- [ ] Implement access/activation gate for the OCR route according to the chosen model, with explicit user-visible failures for unavailable/not-activated/restricted/quota-exhausted paths.
- [ ] Implement OCR route.
- [ ] Implement native extraction route.
- [ ] Complete native extraction engineering slice (parser mapping by format, normalization pipeline, structured native-route errors).
- [ ] Implement PDF triage (`native only` / `OCR only` / `both`).
- [ ] Implement explicit route-choice UX when both routes are viable.
- [ ] Implement post-extraction apply modal with overwrite/append/repetitions.
- [ ] Route extracted text through canonical apply path; keep existing semantics unchanged.
- [ ] Enforce no silent fallback between routes.
- [ ] Enforce failure/abort invariants:
  - current text unchanged
  - no partial extraction surfaced
  - no apply modal shown after abort
  - close-window during processing is treated as cancellation

## 5. Smoke test and quality gate for the basic

- [ ] Build and run core smoke matrix (OCR, native, PDF triage, dual-route choice).
- [ ] Add multilingual smoke coverage across OCR + native routes (at least Latin, CJK, and RTL samples).
- [ ] Run native-route fixture matrix (format coverage + corrupt/encrypted/empty-text-layer cases).
- [ ] Validate precondition rejection scenarios and explicit reason messaging.
- [ ] Validate processing lock behavior:
  - distinct from startup lock
  - only close/minimize/move/abort remain available during processing
- [ ] Validate close-window-during-processing cancellation path and invariants.
- [ ] Validate failure/abort invariants and state separation.
- [ ] Validate access / billing / activation model behavior, including activation gating, restriction paths, and quota/budget/usage-limit failures.
- [ ] Validate canonical apply behavior (overwrite/append/repetitions, MAX_TEXT_CHARS, truncation notice).
- [ ] Validate observability coverage for required fields/events (routes, latency, apply/truncation, precondition/failure/cancel/setup paths).
- [ ] Block progression until basic smoke/quality gate passes.

## 6. Processing progress and ETA implementation

- [ ] Implement processing progress UX.
- [ ] Implement ETA behavior and calibrate realism.
- [ ] Keep progress + ETA visible in the main window whenever the window is not minimized.

## 7. Refinement

- [ ] UI/UX refinement pass.
- [ ] Fill missing `es`/`en` UI localization keys (no hardcoded language fallback logic).
- [ ] Logging review for required observability fields/events and consistency:
  - selected file type
  - available/chosen/executed route
  - OCR/native latency
  - apply choice + repetition count
  - truncation events
  - setup/configuration failures
  - activation/auth/billing/quota/restriction events
  - precondition rejection and cancellation events
- [ ] Code cleanup/refactor while preserving behavior.

## 8. Documentation and compliance closeout

- [ ] Add/update third-party notices, attributions, and license display surfaces.
- [ ] Add/update privacy and external-processing disclosures for chosen substrate/dependencies.
- [ ] Update setup/billing/activation instructions for the chosen access model.
- [ ] Update changelog/release notes and related documentation.
- [ ] Verify all Issue 53 acceptance criteria are covered before closure.
