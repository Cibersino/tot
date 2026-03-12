# Issue 53 Implementation Plan

Linked issue: `docs/issues/issue_53.md`
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

## 1. Substrate decision

- [ ] Evaluate substrate options, starting with Google Document AI as the primary candidate.
- [ ] Compare OCR quality (especially photographed book pages), language coverage, PDF support, setup burden, cost, and Windows fit.
- [ ] Decide substrate and record rationale + known constraints that will affect downstream implementation.

## 2. Substrate setup and manual activation

- [ ] Complete developer-side installation/activation for the chosen substrate.
- [ ] Configure credentials/secrets and required auth/billing setup.
- [ ] Add setup validation flow and explicit user-visible errors for incomplete/missing setup.
- [ ] Confirm setup path and failures follow current logging/bridge-failure policies.

## 3. Contracts before implementation

- [ ] Define shared extraction result contract for all routes:
  - success/failure
  - extracted text
  - executed route
  - warnings/summary
  - safe provenance metadata
  - structured error on failure
- [ ] Define route metadata contract:
  - detected file kind
  - available routes
  - chosen route
  - executed route
  - PDF triage status
- [ ] Lock apply contract: extraction post-apply must reuse the existing canonical overwrite/append/repetitions path (including MAX_TEXT_CHARS + explicit truncation behavior).
- [ ] Lock state taxonomy for behavior/logging distinction:
  - precondition rejected (blocked start)
  - extraction failure (after start)
  - user cancellation/abort
- [ ] Lock processing-mode contract:
  - processing lock is distinct from startup lock
  - while processing, main window/app menu interactions are blocked except close/minimize/move/abort
  - close-window request during processing follows cancellation semantics (same guarantees as abort)

## 4. Basic implementation

- [ ] Add dedicated import/extract button in the text-selector row.
- [ ] Implement file picker open behavior (default folder first, then persisted folder).
- [ ] Implement precondition block (no start when secondary windows are open or stopwatch is running) with explicit user guidance.
- [ ] Isolate Windows-specific implementation behind platform adapters so core extraction/apply orchestration remains OS-agnostic for future macOS/Linux support.
- [ ] Implement processing mode as a distinct lock state (not startup lock) and block normal main-window/menu interactions while active.
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
  - precondition rejection and cancellation events
- [ ] Code cleanup/refactor while preserving behavior.

## 8. Documentation and compliance closeout

- [ ] Add/update third-party notices, attributions, and license display surfaces.
- [ ] Add/update privacy and external-processing disclosures for chosen substrate/dependencies.
- [ ] Update setup/billing/onboarding instructions.
- [ ] Update changelog/release notes and related documentation.
- [ ] Verify all Issue 53 acceptance criteria are covered before closure.
