# Issue 53 Implementation Plan

Source issue: `docs/issues/issue_53.md`  
Scope: File text extraction epic (OCR + native extraction + route selection + canonical apply flow)

## Plan Overview

This plan is ordered and gate-driven.  
Gates 0 to 3 are blocking for substrate-dependent OCR delivery and release compliance.

## Role Division

### Codex
- Draft technical artifacts and implementation docs.
- Implement code changes across main/renderer/IPC/routes.
- Add validation, logging, and failure handling behavior.
- Prepare test evidence and acceptance checklists.
- Recommend technical decisions with tradeoffs.

### User
- Approve substrate choice and fallback strategy.
- Perform real provider setup, credentials, and billing onboarding.
- Approve legal/privacy/compliance wording and release readiness.
- Validate UX/behavior in real usage.
- Make final go/no-go decisions at blocking gates and release.

## Operational Guardrails (Execution Rules)

These rules are mandatory during execution of this implementation plan.

### Evidence and citation discipline
- All repository evidence reported in chat must use relative repository paths.
- Completion updates for each gate/milestone must include concrete evidence paths.

### Drift control protocol
- Any operation that drifts, or may drift, from issue/plan instructions must be explicitly disclosed in chat.
- Drift disclosure must include:
  - instruction being diverged from
  - why divergence is necessary
  - expected impact/risk
  - whether execution paused for user confirmation or proceeded with rationale

### Ambiguity and contradiction handling
- Any doubt, ambiguity, or contradiction in instructions must be surfaced during operations.
- High-impact or blocking ambiguity: pause and ask before performing the operation.
- Low-impact ambiguity: proceed only with an explicit assumption and rationale stated immediately after the operation.

### Architecture and logging constraints
- Respect the modularized style of the current app.
- Avoid inflating `electron/main.js` and `public/renderer.js`; prefer feature modules with small integration seams.
- Respect the current logging style and conventions.
- Follow `electron/log.js`, `public/js/log.js`, and `docs/cleanup/bridge_failure_mode_convention.md`.

## Gate 0: Choose OCR Substrate (Blocking)

### Deliverables
- `docs/ocr/substrate_evaluation.md`
- `docs/adr/adr_0053_ocr_substrate.md`

### Required content
- Evaluate Google Document AI first.
- Comparison matrix including:
  - OCR quality for photographed book pages
  - scanned PDF handling
  - latency profile
  - cost model
  - reliability/failure modes
  - setup burden
  - compliance/legal impact
- Explicit decision and fallback strategy.

### Exit criteria
- One chosen substrate.
- One fallback strategy.
- Decision recorded and approved.

## Gate 1: Developer Manual Setup + Billing Onboarding (Blocking)

### Deliverables
- `docs/ocr/setup_<provider>.md`

### Required content
- Full manual setup from zero:
  - cloud project creation
  - API enablement
  - billing enablement
  - IAM roles
  - credential generation
  - processor/service configuration
  - quota configuration
- Failure troubleshooting:
  - missing credentials
  - missing billing
  - permission errors
  - auth failures
  - connectivity errors

### Exit criteria
- A clean machine can follow the manual and complete setup.
- Setup verification flow passes with no undocumented steps.

## Gate 2: In-App Setup Validation Flow (Blocking Before OCR Route Ships)

### Deliverables
- Provider validation module.
- UI/API path to run validation.

### Required behavior
- Deterministic checks and explicit failure codes for:
  - missing credentials
  - billing not enabled
  - invalid processor/resource configuration
  - authentication failures
  - connectivity failures
- No silent fallback.

### Exit criteria
- Validation action returns stable pass/fail results with actionable messages.

## Gate 3: Privacy, Legal, and Compliance Surfaces (Blocking Before Release)

### Deliverables
- Update `PRIVACY.md`.
- Add/update third-party notices, attributions, and license surfaces.
- Add external-processing disclosure in `en` and `es`.
- Update release legal checklist artifacts.

### Exit criteria
- No pending legal/compliance items for the chosen substrate.
- User-facing disclosure is explicit and localized.

## Milestone 4: Core Extraction Architecture and Contracts

### Deliverables
- Extraction orchestrator module.
- Shared extraction result contract.
- Route metadata contract.
- Structured error taxonomy.

### Exit criteria
- OCR/native/PDF triage all resolve to one internal result shape.

## Milestone 5: Entry Point + Picker + Folder Persistence

### Deliverables
- Dedicated import/extract button in text-selector row.
- Native OS file picker integration.
- Persisted last relevant folder support.

### Required behavior
- First run: use default folder.
- Subsequent runs: use last relevant persisted folder.

### Exit criteria
- Folder behavior is consistent across repeated runs.

## Milestone 6: Preconditions + Processing Lock Mode

### Deliverables
- Precondition checker before extraction start.
- Processing lock mode separate from startup lock.

### Required behavior
- Block start when:
  - any secondary window is open
  - stopwatch is running
- Emit structured `precondition_rejected` with explicit reasons.
- During processing:
  - block normal window/menu interaction
  - allow close/minimize/move/abort
  - show progress and ETA in main window when visible

### Exit criteria
- Precondition rejection, processing, cancellation, and failure are distinct states in UX and logs.

## Milestone 7: Native Extraction Route

### Deliverables
- Native extractors for:
  - `txt`
  - `md`
  - `html`
  - `rtf`
  - `docx`
  - PDF text-layer extraction

### Exit criteria
- Native-capable files process without OCR.
- Failures are explicit and user-visible.

## Milestone 8: OCR Route for Chosen Substrate

### Deliverables
- Provider adapter implementation.
- OCR orchestration integration.
- Progress + ETA updates.

### Required behavior
- Structured OCR failure handling.
- Setup/config errors mapped to clear UI messages.
- OCR latency observability.

### Exit criteria
- OCR route works end-to-end using chosen substrate and validated setup.

## Milestone 9: PDF Triage + Route Choice UX

### Deliverables
- PDF triage classifier.
- Route chooser UX when both routes are viable.

### Required outcomes
- `native-only`
- `ocr-only`
- `both`

### Exit criteria
- No silent route switching when both are available.
- Executed route is logged and visible in result metadata.

## Milestone 10: Post-Extraction Apply Modal via Canonical Apply Path

### Deliverables
- Post-extraction apply modal with:
  - overwrite
  - append
  - repetitions

### Required behavior
- Reuse existing canonical text apply pipeline.
- Preserve existing `MAX_TEXT_CHARS` enforcement.
- Preserve explicit truncation notices.
- No new apply semantics and no parallel apply path.

### Exit criteria
- Apply behavior matches existing app semantics exactly.

## Milestone 11: Abort/Cancel Guarantees + Observability + QA

### Deliverables
- Cancellation propagation through orchestrator.
- Close-window-as-cancel behavior.
- Full structured observability set.
- Acceptance/regression test pass.

### Required behavior
- On abort/cancel:
  - stop safely
  - do not show result
  - do not show partial text
  - do not mutate current text
  - do not show apply modal
- Distinguish in UX and logs:
  - precondition rejection
  - extraction failure
  - user cancellation

### Exit criteria
- All acceptance criteria from `docs/issues/issue_53.md` pass.
