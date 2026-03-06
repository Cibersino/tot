# Issue 139 - Real OCR Preprocessing (Operation-Based)

## Objective

Implement real OCR preprocessing with an operation-based `preprocessConfig` so preprocessing is effective, measurable, and configurable per file.

## Scope

In scope:
* Image OCR preprocessing.
* Scanned PDF OCR preprocessing (page-by-page, after rasterization, before Tesseract).
* Operation-based preprocess contract (`preprocessConfig`) from UI to backend.
* Explicit `preprocessing` progress stage.
* Typed preprocess failures and renderer mapping.
* Active delivery target: `win32-x64`.
* Cross-platform-ready path/wiring for future targets.

Out of scope:
* Paid preprocessing solutions.
* Cloud preprocessing services.
* Shipping preprocess sidecar artifacts for non-Windows targets in this issue (`linux-x64`, `darwin-x64`, `darwin-arm64`).

## Locked Decisions

* Preprocess implementation pattern must mirror current raster/OCR model: prefer bundled binaries + app wrapper/orchestration.
* Do not create/ship a custom preprocess `.exe` unless a documented capability-gap analysis proves bundled binaries cannot satisfy required contract/quality gates.
* Active preprocess contract: operation-based `preprocessConfig`.
* No legacy preprocess modality anywhere in code (`basic|standard|aggressive`).
* No compatibility bridge mapping operation config to legacy profile semantics.
* Missing preprocess binary/runtime files map to `OCR_BINARY_MISSING`.
* No silent fallback when requested preprocess operations fail.
* Current text is unchanged on preprocess/OCR failure or cancel.
* Default preprocess config is all operations `off` for each import run (no persistence across files/sessions).
* Scanned-PDF preprocess failure is fail-fast per job, consistent with current rasterization/OCR failure handling.

## Guardrails

Contract guardrails:
* Single strict preprocess schema.
* Unknown keys are rejected.
* Fixed operation execution order.
* Invalid payload fails with typed preprocess error.

Safety guardrails:
* Input byte-size cap before decode.
* Decoded pixel cap before heavy transforms.
* Output byte-size cap for preprocessed artifacts.
* Deterministic cap handling (clamp/downscale, preserve aspect ratio).
* Temp artifact storage cap per job.

Runtime guardrails:
* No silent fallback when requested preprocess operations fail.
* Preprocess typed failures are a closed set: `OCR_PREPROCESS_UNAVAILABLE|OCR_PREPROCESS_FAILED|OCR_PREPROCESS_TIMEOUT|OCR_PREPROCESS_CANCELED`.
* Dependency/runtime-missing mapping remains `OCR_BINARY_MISSING` (outside preprocess typed failure set).
* Per-page timeout enforcement for scanned PDF preprocessing.
* Scanned-PDF preprocess failure is fail-fast per job (no per-page skip/continue), consistent with current raster/OCR failure policy.
* Cancellation checks before each page and between pages.
* Bounded cancel-latency target for subprocess termination.
* Cleanup required on `completed|failed|canceled`.

UI guardrails:
* Manual params are bounded in UI and revalidated in backend.
* No unbounded free-form preprocess numeric inputs.
* Disabling preprocessing is represented by all operations set to `off`.
* App code pattern avoids hardcoded language strings; user-visible preprocess text should resolve via i18n keys.

Quality guardrails:
* Requested preprocess configurations must be benchmarked against all-operations-off baseline.
* Preprocessing is accepted only if it shows clear net gain on challenging families.
* Quality gate primary metric is CER (percentage points) against fixed ground-truth transcripts.
* "Difficult file" rule and benchmark constants must be fixed before execution and recorded in evidence.

## Default Tuning Baseline (Adjustable)

These are initial defaults for implementation/testing, not immutable policy:
* Max long side: `20,000 px`.
* Max area: `200,000,000 px`.
* Max output artifact bytes: `536,870,912` (`512 MiB`).
* Max input artifact bytes (pre-decode): `536,870,912` (`512 MiB`).
* Keep these defaults unless stability evidence forces lowering them.

## Preprocess Contract (`preprocessConfig`)

Payload shape:
```json
{
  "operations": {
    "<operation_key>": { "mode": "off|auto|manual", "manual": {} }
  }
}
```

Validation rules:
* Strict schema; `operations` required.
* Operation keys and fixed execution order come from Batch 1 scoped-lock declarations.
* Unknown keys and invalid modes are rejected.
* `manual` params must match scoped-lock schema/bounds; unknown manual fields are rejected.
* Invalid payload returns typed preprocess error.

Batch 1 scoped-lock declarations (change-controlled):
* Selected-path concrete declarations are defined in `H01 Batch 1 Scoped-Lock (Initial Implementable Cut)`.
* Locked set includes operation keys, fixed execution order, tool ownership, and bounded manual schema per operation.
* recorded in evidence before Batch 2
* any change requires evidence update and re-run of Operation Compatibility Gate + affected quality checks

## H01 Batch 1 Scoped-Lock (Initial Implementable Cut)

This is the concrete first-implementation cut for selected path `H01` (`ImageMagick -> unpaper`).

Operation keys + tool ownership:
* `normalize_contrast` -> `ImageMagick`
* `binarize` -> `ImageMagick`
* `denoise` -> `ImageMagick`
* `deskew` -> `unpaper`
* `page_cleanup` -> `unpaper`

Fixed execution order:
1. `normalize_contrast`
2. `binarize`
3. `denoise`
4. `deskew`
5. `page_cleanup`

Mode surface (all scoped-lock operations):
* `off` -> operation is skipped.
* `auto` -> operation runs with fixed default preset for the selected tool.
* `manual` -> operation runs with bounded manual schema only.

Bounded manual-schema intent (Batch 1 concise lock):
* `normalize_contrast.manual`: `blackClipPct`, `whiteClipPct` (bounded percentages).
* `binarize.manual`: `thresholdPct` (bounded percentage).
* `denoise.manual`: `passes` (bounded low integer pass count).
* `deskew.manual`: `scanRangeDeg`, `scanStepDeg` (bounded range/step).
* `page_cleanup.manual`: `cleanLevel` (bounded discrete cleanup aggressiveness level).

First-implementation explicit exclusions:
* Exclude operation families outside scoped-lock keys above.
* Exclude geometry/layout-editing controls in this cut (`split`, `mask`, `wipe`, manual crop regions, border/layout transforms).
* Exclude free-form CLI argument passthrough and unbounded manual numeric inputs.
* Exclude runtime operation reordering and branching/parallel preprocess sub-pipelines.

## Preprocess Adapter Contract

Required adapter input:
* Canonical `preprocessConfig` payload (scoped-lock operation keys/order and bounded manual schema).
* Input artifact path and output artifact target.
* Safety/time policy inputs required by app guardrails (caps, timeout hints when applicable).

Required adapter output:
* Structured result with `ok`, `outputPath`, and stats.
* Per-operation stats: requested/effective mode, applied/skipped, params, duration.
* Cap/upscale/resize effects.

Error mapping contract:
* Adapter-native failures must map deterministically to app-level closed set (`OCR_PREPROCESS_*`) and `OCR_BINARY_MISSING` policy.

Transport/protocol note:
* Invocation protocol/argument shape is implementation-defined by selected candidate path (process CLI, wrapper/orchestration, or equivalent) as long as this canonical contract is satisfied.

## Operation Compatibility Gate (Mandatory Evidence)

* For each scoped-lock operation: verify runtime availability, `off|auto|manual` invocation success, applied-proof evidence, and forced-failure typed mapping.
* If any operation/mode fails, remove it from scoped-lock declarations + UI and re-run the gate.
* If removals/changes occur, re-freeze keys/order/schema and re-run impacted checks before continuing.

## Pre-Implementation Decision Gate (Decision Recorded)

Candidate-set setup (required before testing):
* Define bundled-candidate list.
* Define custom-preprocess-candidate list.
* Record/freeze evaluation order for both lists in evidence before execution.

Current decision (2026-03-06):
* Selected candidate path: `H01` (`ImageMagick -> unpaper`) under bundled-binary + app-wrapper strategy.
* Strongest challenger path: `H05` (`ImageMagick -> Leptonica`).
* Decision rationale (priority-ordered): highest current expected extraction improvement + reliability signal with direct comparator-chain evidence in Tesseract-centered OCR ecosystems; challenger retained for immediate fallback if selected path fails full proof.

Evaluation criteria (apply to every candidate):
1. Contract realizability (via wrapper/orchestration):
   * Candidate can expose required `preprocessConfig` behavior (`off|auto|manual`, bounded manual params, scoped-lock key set/order).
2. Runtime-policy realizability (via wrapper/orchestration):
   * Candidate can satisfy timeout/cancel/fail-fast/cleanup semantics required by this issue.
3. Observability realizability:
   * Candidate/wrapper can produce required structured stats/evidence and typed error mapping.
4. Cross-platform-ready architecture:
   * Candidate path/wiring supports future targets (`linux-x64`, `darwin-x64`, `darwin-arm64`) without requiring shipment in this issue.
5. Compliance viability:
   * Licensing/compliance is acceptable for current and planned target model.
6. Quality potential (lightweight, pre-implementation):
   * Collect lightweight comparative signal for expected OCR gain (`deltaCER` vs `off`) without full in-app implementation proof.
   * Allowed inputs: vendor/docs evidence, known benchmarks, minimal probe artifacts, and risk/confidence notes.

Candidate pass condition:
* Candidate passes only if criteria 1-5 pass.
* Criterion 6 is mandatory decision input but not a hard pass/fail gate.

Evidence requirements:
* Record per-candidate pass/fail for criteria 1-5.
* Record criterion 6 quality-potential evidence and confidence notes for each candidate.
* Record commands/artifacts used to determine each criterion result.
* Record final implementation decision and rationale, linked to candidate results.
* Keep decision-gate matrix/source-of-truth updated in `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md`, with cross-references logged in `docs/_evidence/issue_139_evidence.md`.

Candidate selection flow (after candidate pass/fail):
1. Build shortlist of passing candidates.
2. Select one candidate using this priority order:
   * primary: expected extraction improvement and reliability
   * secondary: expected per-operation accuracy/fidelity
   * then: remaining factors
   * complexity/maintenance are part of the negative tradeoff side; they are weighed, but not treated as automatic blockers by default
3. For non-selected candidates, keep evidence light (capability checks + rationale); no full implementation proof required.
4. Perform full implementation proof only for the selected candidate.
5. If selected candidate fails full proof, return to shortlist and reselect (next challenger to evaluate first: `H05`).

User Setup Gate (Required Human Steps):
* After candidate selection and before implementation, run local availability checks for the selected path prerequisites.
* If prerequisites are missing, user performs guided download/install steps.
* After install, rerun availability/version/path checks and record results in evidence.
* Implementation continues only after User Setup Gate is marked complete.

## H01 Substrate Conditions (Carry-Forward Before Batch 1)

The selected path (`H01`: `ImageMagick -> unpaper`) imposes the following binding conditions for later batches.

Implementation non-negotiables (do not waive during implementation):
* Keep implementation strategy as bundled-binaries + app-wrapper/orchestration (no custom preprocess `.exe` unless a new capability-gap is proven).
* Treat compliance as multi-component (`ImageMagick` + `unpaper` + actual `ffmpeg`/package chain used by `unpaper`).
* Do not ship preprocess artifacts without updating both `THIRD_PARTY_NOTICES.md` and `third_party_licenses/**` for preprocess components.
* Build preprocess binaries only under deterministic sidecar paths: `ocr/<platform>-<arch>/preprocess/**`.
* Active target layout required in this issue: `ocr/win32-x64/preprocess/imagemagick/**` and `ocr/win32-x64/preprocess/unpaper/**`.
* Keep hosting model in-repo under `ocr/**` and packaged via `electron-builder.extraResources` unless a new decision is documented.
* Keep runtime binary resolution explicit-root based (no `PATH` discovery).
* Missing preprocess runtime must map to `OCR_BINARY_MISSING`; no silent fallback.
* Keep cross-target-ready preprocess directory contract for `linux-x64`, `darwin-x64`, `darwin-arm64` (even though shipment is out-of-scope in this issue).
* Record full provenance per preprocess bundle (source URL, version/tag, acquisition/build commands, inventory, hashes) and pass release legal/post-packaging gates before ship.

License/compliance conditions:
* `ImageMagick` redistribution must include license copy and attribution in notices.
* `unpaper` redistribution must follow the upstream project licensing model (project under GNU GPL v2, with some files under MIT/Apache 2.0 as declared by upstream SPDX headers).
* Upstream `unpaper` declares `ffmpeg` as a hard dependency for file input/output; preprocess runtime provenance must explicitly capture the actual FFmpeg/package chain used in distributed bundles.
* Before releasing preprocess sidecars, `THIRD_PARTY_NOTICES.md` must add preprocess components with exact upstream source URLs, version/tag, and artifact provenance references.
* Matching license/notice files for every redistributed preprocess component and package-chain dependency must exist under `third_party_licenses/**` and pass release legal baseline checks.

Artifact construction + hosting conditions:
* Preprocess sidecars must follow the existing OCR sidecar model: deterministic files under `ocr/<platform>-<arch>/preprocess/**`, packaged via `electron-builder.extraResources`.
* Required layout for active target in this issue:
  * `ocr/win32-x64/preprocess/imagemagick/**`
  * `ocr/win32-x64/preprocess/unpaper/**`
* Evidence must capture, per preprocess bundle: upstream source URL, version/tag, download/build command(s), source artifact hash, final shipped file inventory, and final binary hashes.
* Hosting decision for this issue: preprocess runtime artifacts are hosted in-repo under `ocr/**` (same model as existing OCR sidecars). Any hosting-model change must be documented in issue + evidence before merge.

Packaging conditions (active Windows scope + cross-target availability path):
* Shipping scope in this issue remains `win32-x64`; preprocess sidecar shipment for `linux-x64`, `darwin-x64`, `darwin-arm64` stays out of scope for this issue.
* Cross-target availability remains mandatory at architecture level: preserve registry-driven sidecar wiring for all target keys and reserve preprocess directory contract for future target bundles:
  * `ocr/linux-x64/preprocess/`
  * `ocr/darwin-x64/preprocess/`
  * `ocr/darwin-arm64/preprocess/`
* Runtime resolution remains explicit-root based (no system `PATH` lookup), and missing preprocess runtime must map to `OCR_BINARY_MISSING`.
* When Linux/macOS preprocess bundles are introduced in a later release, packaging must include target-specific preprocess artifacts plus `docs/releases/ocr_cross_target_smoke_matrix.md` evidence for each distributed target.

## OCR Pipeline Integration

Image OCR stage order:
* `queued -> preprocessing -> ocr -> finalizing` (success path may emit `completed`).

Scanned PDF OCR stage order:
* `queued -> preflight -> rasterizing -> preprocessing -> ocr -> finalizing` (success path may emit `completed`).

Terminal signaling:
* `failed|canceled` finalized via `import-finished`.
* `completed` confirmed by `import-finished` after final success progress.

## Error Model

Required preprocess typed errors (closed set):
* `OCR_PREPROCESS_UNAVAILABLE`
* `OCR_PREPROCESS_FAILED`
* `OCR_PREPROCESS_TIMEOUT`
* `OCR_PREPROCESS_CANCELED`

Policy mapping:
* Missing preprocess binary/runtime files -> `OCR_BINARY_MISSING` (dependency/runtime-missing mapping; outside preprocess closed set).
* Scanned-PDF preprocess failure handling must match current raster/OCR policy: fail-fast job abort (no per-page skip/continue).

## UI Requirements

OCR options modal must provide:
* Per-operation mode control: `off|auto|manual`.
* Bounded manual parameter inputs for operations in `manual`.
* Explicit action to set all operations to `off` for baseline/disable behavior.
* Default state for each new import run: all operations `off`.
* No preprocess config persistence across files or app sessions.
* No legacy profile selector anywhere in code.

## Quality Gate (Mandatory)

Execution timing rule:
* Run the mandatory full quality gate as soon as the feature has the minimum requirements to allow it.

Baseline:
* all operations `mode: off`.

Comparison configurations:
* Auto configuration (operation defaults in `auto`).
* Manual configuration(s) with bounded tuning.

Metric contract:
* Primary gate metric: CER (Character Error Rate), in percentage points.
* CER formula (per file/run): `CER = (char_edit_distance / reference_char_count) * 100`.
* Secondary metric (diagnostic-only, non-gating): WER.
* Text normalization/scoring pipeline must be identical for baseline and non-off runs.

Challenging families (value-gated):
* Photographed page.
* Scanned PDF.
* Noisy/low-contrast sample.

Benchmark constants (fixed before execution, recorded in evidence):
* `D` difficult-file threshold in CER points (default: `30.0`).
* `M` minimum median CER improvement in points (default: `5.0`).
* `S` minimum share-of-files-improved threshold (default: `33%`).
* `N_min` minimum difficult files per challenging family (default: `6`).

Pass/fail requirements:
1. Build benchmark set with fixed reference transcripts for every file in each challenging family.
2. Run baseline (`all operations off`) and classify difficult files as `CER_off >= D`.
3. For each challenging family, ensure difficult subset size `>= N_min`; if not, expand corpus until met (otherwise quality gate cannot close).
4. Evaluate tested non-off configurations on difficult subset and compute:
   * `deltaCER = CER_off - CER_nonoff` (per file)
   * `median_improvement = median(deltaCER)` (family-level, difficult subset)
   * `share_improved = % of difficult files where deltaCER > 0`
5. Family passes when at least one non-off configuration satisfies both:
   * `median_improvement >= M`
   * `share_improved >= S`
6. Record evidence table per challenging family with per-file values (`CER_off`, `CER_nonoff`, `deltaCER`, improved yes/no), runtime, and artifacts/sample references.
7. If any challenging family fails requirement #5, preprocessing is not ready to ship.

## Files Likely to Change

Core:
* `electron/import_ocr/preprocess_pipeline.js`
* `electron/import_ocr/ocr_pipeline.js`
* `electron/import_ocr/pdf_raster_ocr.js`
* `electron/import_ocr/orchestrator.js`
* `electron/import_ocr/ocr_runtime.js`
* `electron/import_ocr/platform/profile_registry.js`
* `electron/import_ocr/platform/resolve_sidecar.js`
* `electron/import_ocr/platform/process_control.js`

Renderer/UI:
* `public/index.html`
* `public/js/import_ocr_ui.js`
* `public/js/import_ocr_ui_shared.js`
* `public/js/import_ocr_ui_progress.js`
* `public/js/import_ocr_ui_options_modal.js`
* `public/js/import_entry.js`
* `public/renderer.js`
* `public/info/instrucciones.*.html`

i18n:
* `i18n/en/renderer.json`
* `i18n/es/renderer.json`
* `i18n/es/es-cl/renderer.json`
* `i18n/de/renderer.json`
* `i18n/fr/renderer.json`
* `i18n/it/renderer.json`
* `i18n/pt/renderer.json`
* `i18n/arn/renderer.json`

Packaging/compliance:
* `package.json` (if needed)
* `ocr/**`
* `THIRD_PARTY_NOTICES.md`
* `third_party_licenses/**`

Docs/evidence:
* `docs/_evidence/issue_139_evidence.md`
* `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md`
* `docs/test_suite.md`
* `docs/releases/release_checklist.md`
* `docs/changelog_detailed.md`

## Execution Batches

### Batch 1 - Contract Core + Setup

Goal:
* Deliver core operation contract + validation foundations and selected-path setup.

Includes:
* User Setup Gate completion for selected path prerequisites.
* Preprocess operation contract and JSON output foundations.
* Backend `preprocessConfig` validation foundations.

### Batch 2 - Runtime + Integration

Goal:
* Deliver runtime wiring and OCR-route integration under the chosen implementation path.

Includes:
* Runtime artifact establishment/build according to chosen path.
* Image + scanned-PDF preprocess integration.
* Timeout/cancel/error mapping + `preprocessing` progress stage wiring.
* No-legacy cleanup (remove old preprocess modality remnants).

### Batch 3 - UI + Verification + Quality Gate

Goal:
* Finalize user-facing controls, verify Batch 2 behavior end-to-end, and close mandatory quality gate.

Includes:
* OCR options modal migration to operation controls.
* EN/ES user-facing preprocess strings (required before smoke/gate to keep the app's i18n-first code pattern).
* Manual in-app smoke and evidence capture.
* Mandatory quality-gate execution and closure immediately after smoke.

### Batch 4 - UX Controls + Hardening

Goal:
* UX hardening and UI refinement after Batch 3 quality-gate closure, with emphasis on OCR options modal usability.

Includes:
* OCR options modal refinement (post-gate): information architecture, operation grouping/order, labels/help text clarity.
* OCR options modal UX polish: inline validation messaging for bounded manual params, set-all-off/reset clarity, apply/cancel behavior, keyboard/accessibility pass.
* ETA calibration with preprocessing.
* Preflight ETA estimation polish: initial estimate before first OCR page, stage-weight tuning, and recalibration after first processed pages.
* Remaining locales (`de`, `fr`, `it`, `pt`, `arn`, `es-cl`) and modal-copy consistency polish.
* Post-gate regression spot-checks (non-gating) after UX/localization changes.

### Batch 5 - Packaging + Compliance + Release Docs

Goal:
* Release-ready output for active target.

Includes:
* `win32-x64` packaging inclusion.
* Notices/licenses updates.
* Release/test/changelog updates.
* Instructions HTML updates.

## Evidence Protocol

* Before checking any item, ensure `docs/_evidence/issue_139_evidence.md` exists.
* For Pre-Implementation Decision Gate evidence, keep `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md` updated and aligned with checklist state.
* Every checked item must include evidence entry:
  * timestamp
  * command/test executed
  * result
  * artifact/log reference
* Code-level smoke does not replace in-app smoke.
* In-app smoke is manual by the user.

## Checklist

### Pre-Implementation Decision Gate
* [x] Define bundled/custom candidate lists and freeze evaluation order in evidence.
* [x] Evaluate candidates against decision-gate criteria and record per-candidate results:
  * [x] criteria 1-5 pass/fail
  * [x] criterion 6 quality-potential evidence + confidence notes (no full implementation proof)
* [x] Run capability-gap analysis from candidate results and record evidence.
* [x] Select one passing candidate using decision-gate priority order (primary quality/reliability, secondary operation fidelity, then remaining factors; complexity/maintenance weighed as negative-side factors, not automatic blockers by default).
* [x] Keep non-selected candidate evidence light (no full implementation proof).
* [x] Record implementation decision: bundled-binary strategy or custom `.exe` (only if capability-gap is proven).
* [x] Record substrate carry-forward constraints in issue + evidence (license/compliance, artifact build+hosting, packaging path).

### Batch 1
* [ ] Complete User Setup Gate for selected candidate (`H01`) (no full proof yet):
  * [ ] run local availability checks for selected-path prerequisites
  * [ ] if missing, execute guided user download/install steps
  * [ ] rerun availability/version/path checks and record evidence
* [ ] Record implementation-start evidence entries for Batch 1 setup checks.
* [ ] Implement H01 scoped-lock operation registry (keys, fixed order, tool ownership) per `H01 Batch 1 Scoped-Lock (Initial Implementable Cut)`.
* [ ] Implement H01 bounded manual-schema validation (including unknown-field and out-of-bounds rejection).
* [ ] Enforce H01 first-cut exclusions in adapter/validation layer (no extra operations, no geometry/layout controls, no free-form CLI passthrough).
* [ ] Implement preprocess adapter contract (canonical `preprocessConfig` semantics; no legacy profile arg anywhere).
* [ ] Implement preprocess runner JSON output with per-operation stats.
* [ ] Implement strict backend `preprocessConfig` validation against the H01 Batch 1 scoped-lock declarations.

### Batch 2
* [ ] Implement preprocess execution with deterministic temp outputs and safety caps.
* [ ] If bundled-binary strategy is selected, establish runtime artifacts for `win32-x64` and verify paths under `ocr/<platform>-<arch>/preprocess/...`.
* [ ] If (and only if) custom `.exe` path is selected by evidence, build preprocess artifact and verify runtime satisfies the canonical preprocess adapter contract.
* [ ] Record preprocess dependency/artifact provenance in evidence.
* [ ] Pass Operation Compatibility Gate for each operation in issue scope with evidence entries.
* [ ] Do not introduce compatibility bridge logic (no operation -> legacy profile mapping anywhere).
* [ ] Remove all legacy preprocess artifacts from codebase (`preprocessProfile`, profile selector/options, legacy preprocess i18n keys).
* [ ] Integrate preprocess into image OCR route.
* [ ] Integrate preprocess into scanned-PDF per-page route.
* [ ] Reuse timeout/cancel/process-control pattern.
* [ ] Emit and wire `preprocessing` stage.
* [ ] Map preprocess typed errors to renderer and user-visible messages.
* [ ] Keep missing-binary mapping to `OCR_BINARY_MISSING`.
* [ ] Guarantee no text mutation on failure/cancel.
* [ ] Guarantee cleanup on success/failure/cancel.

### Batch 3
* [ ] Add EN/ES preprocessing stage and error strings (required before smoke/gate to keep the app's i18n-first code pattern).
* [ ] Replace OCR modal profile UI with operation controls (per-operation `off|auto|manual`, bounded manual params, and explicit set-all-off action).
* [ ] Implement bounded manual parameter wiring UI -> backend -> sidecar.
* [ ] Verify default preprocess state is all operations `off` on each new import run.
* [ ] Verify no preprocess config persistence across file change and app restart.
* [ ] Run in-app smoke and record evidence:
  * [ ] image OCR success
  * [ ] scanned PDF OCR success
  * [ ] scanned PDF preprocess failure is fail-fast job abort (no per-page continue)
  * [ ] cancel during preprocessing
  * [ ] forced preprocess timeout/failure
* [ ] Execute and pass mandatory quality gate immediately after smoke:
  * [ ] photographed page challenging family
  * [ ] scanned PDF challenging family
  * [ ] noisy/low-contrast challenging family
  * [ ] define and record benchmark constants before execution (`D`, `M`, `S`, `N_min`)
  * [ ] provide fixed reference transcripts and CER scoring method for all benchmark files
  * [ ] for each challenging family, verify difficult subset size `>= N_min`
  * [ ] for each challenging family, record per-file table (`CER_off`, `CER_nonoff`, `deltaCER`, improved yes/no), runtime, and artifacts
  * [ ] for each challenging family, record whether pass/fail requirement #5 is met
  * [ ] reuse previously recorded benchmark corpus/results where applicable (quality gate is not a duplicate smoke phase)

### Batch 4
* [ ] Refine OCR options modal information architecture (operation grouping/order and control labeling).
* [ ] Improve modal guidance/help copy for `off|auto|manual` and bounded manual inputs.
* [ ] Improve modal inline validation and feedback messaging for manual-parameter bounds/errors.
* [ ] Polish modal actions/interaction (`set all off`, reset/apply/cancel behavior, keyboard/accessibility).
* [ ] Update ETA logic with preprocessing stage.
* [ ] Polish preflight ETA estimations (initial ETA before first OCR page, stage-weight balancing, and recalibration after first processed pages) and record evidence.
* [ ] Add remaining active locale strings (`de`, `fr`, `it`, `pt`, `arn`, `es-cl`) and ensure modal-copy consistency.
* [ ] Run post-gate regression quality spot-check after UX/localization changes (non-gating) and record evidence.

### Batch 5
* [ ] Package preprocess sidecar in active target artifacts (`win32-x64`).
* [ ] Update notices/licenses for preprocess dependencies.
* [ ] Update release/test/changelog/smoke docs.
* [ ] Update instructions HTML files.

## Acceptance Criteria

Functional:
* `preprocessConfig` has real backend effect for image and scanned-PDF OCR.
* Progress includes explicit `preprocessing`.
* Preprocess failure yields explicit typed error and no text mutation.

Policy:
* No silent fallback in preprocess/OCR flow.
* Missing preprocess runtime maps to `OCR_BINARY_MISSING`.
* Implementation strategy follows bundled-binary-first policy; custom preprocess `.exe` is allowed only with documented capability-gap justification.
* Instructions HTML files are updated to reflect preprocess UX/behavior changes.

Quality:
* Product-level value requirement is closed: preprocessing shows clear net gain vs `all operations off` on photographed, scanned-PDF, and noisy/low-contrast challenging families.
* Benchmark constants (`D`, `M`, `S`, `N_min`) were fixed before execution and recorded in evidence.
* Each challenging family has difficult subset size `>= N_min`.
* Each challenging family meets both pass criteria (`median_improvement >= M` and `share_improved >= S`) on difficult subset.
* If any challenging family fails those criteria, preprocessing is not ready to ship.
* No renderer freeze regression.
* No temp artifact leak across success/failure/cancel.
* OCR lock/cancel behavior remains consistent.

## Minimum Test Plan

1. Image OCR quality benchmark (photographed family): baseline (`off`) vs tested non-off configs; compute per-file `CER_off`, `CER_nonoff`, `deltaCER`, improved yes/no; report `median_improvement` and `share_improved`.
2. Scanned PDF quality benchmark: baseline (`off`) vs tested non-off configs on challenging scanned files; compute same CER aggregates and verify family pass/fail against `M` and `S`.
3. Noisy/low-contrast quality benchmark: baseline (`off`) vs tested non-off configs; compute same CER aggregates and verify family pass/fail against `M` and `S`.
4. Scanned PDF OCR functional check: verify per-page preprocessing stage transitions.
5. Scanned PDF preprocess forced failure: verify fail-fast job abort (no per-page continue), typed error, and cleanup.
6. Cancel during preprocessing: verify typed cancel and cleanup.
7. Forced preprocess runtime-missing: verify typed error and no text mutation.
8. Regression: `txt|docx|selectable-PDF` flows unchanged.
