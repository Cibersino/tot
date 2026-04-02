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

Clarification note:

- The historical evaluation labels in Section 1 (`vendor-managed`, `user-managed`, `hybrid/optional`) are retained as decision-history shorthand.
- The refined preferred production-target interpretation for the chosen route now lives in `docs/issues/issue_53_access_model_options.md`.

- [x] Evaluate substrate options, starting with Google Document AI as the primary candidate.
- [x] Compare OCR quality (especially photographed book pages), language coverage, PDF support, setup burden, cost, Windows-first delivery fit, and cross-platform architectural viability.
- [x] Evaluate the OCR access / billing / activation model for distributed app delivery alongside substrate evaluation:
  - vendor-managed
  - user-managed
  - hybrid/optional
- [x] Decide substrate and access model, and record rationale + known constraints that will affect downstream implementation.

## 2. Substrate setup / billing / activation path

Clarification note:

- Section 2 records the current implemented/testing baseline and the constraints needed to build the route.
- The preferred production-target model is now more specific than the older shorthand:
  - Google-side assets: app-owner-owned
  - runtime credential/configuration delivery: bundled with the app
  - runtime Google identity: end user's Google account
  - usage-cost/quota context: end user's Google-side usage context
  - auth/runtime contract: desktop OAuth client + system browser + loopback callback + PKCE + bundled `client_secret`
- Until the production transition is actually implemented, the historical testing/runtime constraints in this section remain valid evidence of the current repo behavior.

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
- [x] Define quota/budget/usage-limit handling for the chosen model.
  - Owner: `Codex` (implementation + docs).
  - Done when:
    - quota/limit failures map to `quota_or_rate_limited` (or narrower mapped state with equivalent explicitness).
    - user guidance for retry/wait/reconnect actions is defined.
    - no quota/limit path degrades into silent fallback.
    - policy lock for current Drive route:
      - no additional app-imposed budget caps are introduced in this phase.
      - temporary rate-limit responses (including HTTP `429`) use bounded exponential-backoff retry, then fail as `quota_or_rate_limited` if still unresolved.
      - explicit non-retryable provider limit responses fail fast as `quota_or_rate_limited`.
      - user guidance: wait + retry for temporary rate limits; reconnect is for auth/activation failures, not for quota/rate-limit failures.
- [x] Add setup validation flow and explicit user-visible errors for incomplete/missing setup, missing credentials, billing/auth issues, and quota/budget/usage-limit issues.
  - Owner: `Codex` + `User` (manual validation run).
  - Done when:
    - validation checks credentials presence, activation status, and reachable API path.
    - each setup/auth/quota category has explicit user-visible failure handling.
    - failure categories are logged with structured details safe for logs.
    - scope boundary for item 7:
      - implement backend/IPC validation + explicit error taxonomy only.
      - do not wire OCR UI triggers in this item.
      - do not use legacy `cargador_*` menu paths.
- [x] Confirm setup path and failures follow current logging/bridge-failure policies.
  - Owner: `Codex`.
  - Done when:
    - setup and activation paths follow existing warn/error conventions in `log.js` style.
    - optional bridge failures are non-crashing and explicit; required-path failures are explicit and blocking.
    - evidence is captured in Issue 53 tracker before Section 4 coding starts.
    - evidence confirms item 7/8 introduced no OCR UI trigger wiring outside Section 4 dedicated entrypoint tasks.

## 3. Contracts before implementation

Status note (authoritative):

- Reopened by explicit user decision on 2026-03-14.
- Revalidated and relocked on 2026-03-14 after Section 2 item 7/8 completion.
- `docs/issues/issue_53_contracts.md` is now the authoritative Section 3 baseline for Section 4 implementation.

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

Entrypoint guardrail:

- Section 4 is the first allowed stage for OCR UI trigger wiring.
- OCR trigger wiring must start from the dedicated import/extract entrypoint in this section.
- Legacy `cargador_texto` / `cargador_imagen` menu paths are forbidden for Issue 53 OCR flow.

- [x] Add dedicated import/extract button in the text-selector row.
- [x] Implement file picker open behavior (default folder first, then persisted folder).
- [x] Implement precondition block (no start when secondary windows are open or stopwatch is running) with explicit user guidance.
- [x] Isolate Windows-specific implementation behind platform adapters so core extraction/apply orchestration remains OS-agnostic for future macOS/Linux support.
- [x] Implement processing mode as a distinct lock state (not startup lock) and block normal main-window/menu interactions while active.
- [x] Implement access/activation gate for the OCR route according to the chosen model, with explicit user-visible failures for unavailable/not-activated/restricted/quota-exhausted paths.
- [x] Implement OCR route.
- [x] Implement native extraction route.
- [x] Complete native extraction engineering slice (parser mapping by format, normalization pipeline, structured native-route errors).
- [x] Implement PDF triage (`native only` / `OCR only` / `both`).
- [x] Implement explicit route-choice UX when both routes are viable.
- [x] Implement post-extraction apply modal with overwrite/append/repetitions.
- [x] Route extracted text through canonical apply path; keep existing semantics unchanged.
- [x] Enforce no silent fallback between routes.
- [x] Enforce failure/abort invariants:
  - current text unchanged
  - no partial extraction surfaced
  - no apply modal shown after abort
  - close-window during processing is treated as cancellation

## 5. Smoke test and quality gate for the basic

- [x] Build and run core smoke matrix (OCR, native, PDF triage, dual-route choice).
- [x] Add multilingual smoke coverage across OCR + native routes (at least Latin, CJK, and RTL samples).
- [x] Run native-route fixture matrix (format coverage + corrupt/encrypted/empty-text-layer cases).
- [x] Validate precondition rejection scenarios and explicit reason messaging.
- [x] Validate processing lock behavior:
  - distinct from startup lock
  - only close/minimize/move/abort remain available during processing
- [x] Validate close-window-during-processing cancellation path and invariants.
- [x] Validate failure/abort invariants and state separation.
- [x] Validate access / billing / activation model behavior, including activation gating, restriction paths, and quota/budget/usage-limit failures.
- [x] Validate canonical apply behavior (overwrite/append/repetitions, MAX_TEXT_CHARS, truncation notice).
- [x] Validate observability coverage for required fields/events (routes, latency, apply/truncation, precondition/failure/cancel/setup paths).
- [x] Block progression until basic smoke/quality gate passes.

## 6. Honest waiting UX

Section 6 decision note (locked after item-1 feasibility + utility evaluation):

- Section 6 applies only after `executePreparedImportExtract(...)` starts.
  - The prepare stage remains outside processing mode.
  - The prepare stage may keep its lightweight prepare-status UI, but it is out of Section 6 waiting-UX scope.
- In Section 6 wording, `both` refers to the dual-route PDF prepare outcome (`choice required`), not to a third execute-stage route.
  - Once execution starts, the evaluated/executed route is `native` or `ocr`.
- Fast successful routes must not be artificially delayed only to make waiting feedback visible.
- OCR retries and OCR cleanup remain in scope because they affect what the user experiences while waiting.
- The visibility requirement for this section is limited to the main window when that window is not minimized.
  - This section does not, by itself, require a separate OS/taskbar/native-shell progress surface.
- Section 6.1 conclusion:
  - Dedicated progress will not be implemented for Issue 53.
  - ETA will not be implemented for Issue 53.
  - Native execution is too fast to justify dedicated progress/ETA UX.
  - OCR execution is dominated by opaque provider-side conversion wait; measured determinate progress coverage was too low to be useful, and realistic ETA was not credible enough.
  - Stage-only progress without meaningful remaining-time information was also judged too weak to justify separate implementation.
- Replacement Section 6 UX scope:
  - Keep an indeterminate waiting state in the existing processing container.
  - Use clear route-aware processing copy where helpful, without pretending to know progress.
  - Show elapsed processing time while execution is active.
  - Show final elapsed processing time in the success apply modal.
  - No fake phases, percentages, or remaining-time promises.

- [x] Evaluate feasibility and tradeoffs for progress/ETA by route (`ocr`, `native`, `both`) and lock Section 6 scope before implementation.
- [x] Implement honest waiting UX in the main window during execution.
- [x] Show elapsed processing time during execution and keep the waiting UX visible whenever the main window is not minimized.
- [x] Show final elapsed processing time in the success apply modal.

## 7. Refinement

- [x] UI/UX refinement pass.
- [x] Fill missing `es`/`en` UI localization keys (no hardcoded language fallback logic).
- [x] Logging review for required observability fields/events and consistency:
  - selected file type
  - available/chosen/executed route
  - OCR/native latency
  - apply choice + repetition count
  - truncation events
  - setup/configuration failures
  - activation/auth/billing/quota/restriction events
  - precondition rejection and cancellation events
- [x] Code cleanup/refactor while preserving behavior.

## 8. Documentation and compliance closeout

- [x] Add/update third-party notices, attributions, and license display surfaces.
- [x] Add/update privacy and external-processing disclosures for chosen substrate/dependencies.
- [x] Update instructions and assets.
- [x] Update changelog/release notes and related documentation.
- [x] Verify all Issue 53 acceptance criteria are covered before closure.

## 9. Packaging and distribution validation

- [ ] Build the Windows packaged artifact(s) for the current release path and confirm the build completes with the required app assets/resources bundled.
- [ ] Run a packaged-app smoke validation on Windows for the import/extract entrypoint and core routes (`native`, `ocr`, `pdf both`, abort).
- [ ] Validate packaged-path behavior for the chosen OCR model:
  - `app.getPath('userData')` credential/token locations
  - system-browser OAuth activation launch
  - packaged runtime access to required notices/disclosure/setup surfaces
- [ ] Validate installer/distribution artifact behavior for the intended delivery mode (install/run, app identity, persistence, and upgrade-safe config/token handling).
- [ ] Confirm release posture for the chosen OCR access model:
  - private testing / narrow manual distribution vs public release
  - if public release is intended, production OAuth publication requirements are explicitly tracked and not silently treated as already solved
