# Issue 139 - Smoke + Quality Gate Verification Guide

## 1) Purpose

Close the separated `Smoke test and quality gate` section from `docs/issues/Issue_139.md` using one integrated flow:

1. run in-app smoke scenarios
2. execute the mandatory quality gate immediately after smoke
3. record evidence and update checklist items

This guide avoids duplicated work by reusing smoke outputs in quality-gate scoring whenever the metric contract is satisfied.

Scope boundary:

- this guide is the execution runbook for the separated smoke/quality-gate closure items:
  - `Run in-app smoke and record evidence`
  - `Execute and pass mandatory quality gate immediately after smoke`
- Batch 4/5 tasks remain out of scope for this runbook

## 2) Coordination Model

- User:
  - executes app UI actions
  - executes smoke manually in-app (code-level checks do not replace in-app smoke)
  - provides screenshots and observed outcomes
  - confirms when each scenario starts/ends
- Codex:
  - performs preflight checks
  - validates results against expected behavior
  - prepares evidence artifacts/tables
  - updates `docs/_evidence/issue_139_evidence.md` and checklist in `docs/issues/Issue_139.md`

## 3) Integrated Verification Flow

Run phases in order, without skipping:

1. Phase A - Preflight
2. Phase B - Smoke scenarios
3. Phase C - Quality gate (immediately after smoke)
4. Phase D - Evidence consolidation and checklist closure

## 4) Required Files and Artifacts (Non-duplicated)

### 4.1 Shared prerequisites (used by both Smoke and Quality Gate)

- [x] `docs/issues/Issue_139.md`
- [x] `docs/_evidence/issue_139_evidence.md`
- [x] `docs/issues/Issue_139_Smoke_Quality_Gate_Verification_Guide.md`
- [x] `docs/_evidence/issue_139_operation_gate/operation_gate_report.json`
- [x] `public/index.html`
- [x] `public/style.css`
- [x] `public/js/import_ocr_ui.js`
- [x] `public/js/import_ocr_ui_options_modal.js`
- [x] `public/js/import_ocr_ui_shared.js`
- [x] `public/js/import_ocr_ui_progress.js`
- [x] `public/js/import_entry.js`
- [x] `public/renderer.js`
- [x] `electron/import_ocr/orchestrator.js`
- [x] `electron/import_ocr/ocr_pipeline.js`
- [x] `electron/import_ocr/pdf_raster_ocr.js`
- [x] `electron/import_ocr/preprocess_pipeline.js`
- [x] `electron/import_ocr/preprocess_runtime.js`
- [x] `i18n/en/renderer.json`
- [x] `i18n/es/renderer.json`
- [x] `i18n/es/es-cl/renderer.json`
- [x] `ocr/win32-x64/preprocess/imagemagick/magick.exe`
- [x] `ocr/win32-x64/preprocess/unpaper/unpaper.exe`

### 4.2 Smoke input selection (from shared quality corpus; no separate file list)

- [ ] choose smoke inputs by selecting rows from `docs/_evidence/issue_139_quality_gate/corpus_manifest.tsv`
- [ ] required smoke subset: at least 1 `photographed`, 1 `scanned_pdf`, and 1 `noisy_low_contrast` file id
- [ ] selected smoke file ids must remain in the quality-gate benchmark set (reuse; no duplicate corpus)
- [ ] optional aliases such as `sample_image.png` and `sample_scanned.pdf` are allowed only if they are already registered in the manifest (N/A in current seed set)

### 4.3 Quality-gate-specific required input and artifact files

These files must exist before closing the quality gate. Create them if missing.

- [ ] `docs/_evidence/issue_139_quality_gate/corpus/photographed/*` (real input files for photographed family)
- [ ] `docs/_evidence/issue_139_quality_gate/corpus/scanned_pdf/*` (real scanned-PDF input files)
- [ ] `docs/_evidence/issue_139_quality_gate/corpus/noisy_low_contrast/*` (real noisy/low-contrast input files)
- [ ] `docs/_evidence/issue_139_quality_gate/quality_gate_constants.json`
- [ ] `docs/_evidence/issue_139_quality_gate/corpus_manifest.tsv`
- [ ] `docs/_evidence/issue_139_quality_gate/reference_transcripts/photographed/*.txt`
- [ ] `docs/_evidence/issue_139_quality_gate/reference_transcripts/scanned_pdf/*.txt`
- [ ] `docs/_evidence/issue_139_quality_gate/reference_transcripts/noisy_low_contrast/*.txt`
- [ ] `docs/_evidence/issue_139_quality_gate/results_off.tsv`
- [ ] `docs/_evidence/issue_139_quality_gate/results_nonoff.tsv`
- [ ] `docs/_evidence/issue_139_quality_gate/cer_table_photographed.tsv`
- [ ] `docs/_evidence/issue_139_quality_gate/cer_table_scanned_pdf.tsv`
- [ ] `docs/_evidence/issue_139_quality_gate/cer_table_noisy_low_contrast.tsv`
- [ ] `docs/_evidence/issue_139_quality_gate/quality_gate_summary.json`

Current status note:
- transcript files currently contain placeholders and must be replaced with fixed ground truth before scoring.
- corpus size is still below `N_min` per family and must be expanded before quality-gate closure.

Manifest minimum contract:

- each benchmark input row in `corpus_manifest.tsv` must map `file_id` -> input file path -> reference transcript path -> family
- every input file listed in the manifest must have a matching transcript file
- the benchmark set must be large enough to allow difficult subset expansion up to `N_min` per family

## 5) Phase A - Preflight Commands (Codex)

```powershell
npm run lint
node --check public/js/import_ocr_ui.js
node --check public/js/import_ocr_ui_options_modal.js
node --check public/js/import_ocr_ui_progress.js
node --check electron/import_ocr/orchestrator.js
node --check electron/import_ocr/ocr_pipeline.js
node --check electron/import_ocr/pdf_raster_ocr.js
node --check electron/import_ocr/preprocess_runtime.js
```

Preflight pass condition:

- all commands pass
- sidecar preprocess binaries exist and are executable
- smoke subset file ids are selected from `corpus_manifest.tsv` and recorded in evidence before running scenarios
- required EN/ES preprocess UI strings are present in `i18n/en/renderer.json` and `i18n/es/renderer.json`

## 6) Phase B - Smoke Scenarios

### B3-SMOKE-01 Image OCR success

1. Import the selected `photographed` file id from `corpus_manifest.tsv`.
2. Enable at least one preprocess operation (`auto` or `manual`).
3. Start OCR and complete apply flow.

Expected:

- `preprocessing` stage appears before `ocr`
- terminal `import-finished` is `ok: true`
- text updates only after apply action

### B3-SMOKE-02 Scanned PDF OCR success

1. Import the selected `scanned_pdf` file id from `corpus_manifest.tsv`.
2. Enable preprocess operation(s).
3. Start OCR and allow full completion.

Expected:

- `preflight -> rasterizing -> preprocessing -> ocr -> finalizing`
- terminal `ok: true`
- page counters reach completion (`N/N`)

### B3-SMOKE-03 Scanned PDF preprocess fail-fast

Deterministic method:

1. Close app.
2. Rename `ocr/win32-x64/preprocess/unpaper/unpaper.exe` to `unpaper.exe.bak`.
3. Relaunch app and run scanned PDF OCR with `deskew` or `page_cleanup` enabled.

Expected:

- fail-fast abort for the job
- no per-page continue after preprocess failure
- explicit user-visible failure mapping
- terminal code maps to `OCR_BINARY_MISSING` in this deterministic runtime-missing method

Cleanup:

1. Close app.
2. Restore `unpaper.exe`.

### B3-SMOKE-04 Cancel during preprocessing

1. Start OCR using a selected `scanned_pdf` file id with multiple preprocess operations enabled.
2. Cancel while stage is `preprocessing`.

Expected:

- terminal state is canceled
- no text mutation
- subsequent OCR run still works (cleanup verified)

### B3-SMOKE-05 Forced preprocess timeout/failure

Minimum deterministic acceptance:

1. Force preprocess runtime missing (temporary rename of required preprocess binary).
2. Run OCR with preprocess enabled on any selected smoke file id from the manifest.

Expected:

- explicit preprocess/runtime failure mapping
- no text mutation
- accepted terminal code for this deterministic method: `OCR_BINARY_MISSING`

Note:

- if deterministic timeout can be reproduced, record it as additional evidence
- if not reproducible, forced failure evidence is acceptable for this smoke item

## 7) Phase C - Quality Gate (Immediate After Smoke)

### 7.1 Freeze constants before execution

Record in `docs/_evidence/issue_139_quality_gate/quality_gate_constants.json`:

- `D` difficult threshold (default `30.0`)
- `M` minimum median CER improvement (default `5.0`)
- `S` minimum share improved (default `33%`)
- `N_min` minimum difficult files per family (default `6`)

### 7.2 Metric contract (must remain identical across runs)

- primary metric: CER
- CER formula: `(char_edit_distance / reference_char_count) * 100`
- secondary metric: WER (diagnostic only, non-gating)
- same text normalization/scoring pipeline for all baseline/non-off runs

### 7.3 Families to evaluate

- photographed page: files from `docs/_evidence/issue_139_quality_gate/corpus/photographed/*`
- scanned PDF: files from `docs/_evidence/issue_139_quality_gate/corpus/scanned_pdf/*`
- noisy/low-contrast: files from `docs/_evidence/issue_139_quality_gate/corpus/noisy_low_contrast/*`

Required before family scoring:

- each family file must be registered in `docs/_evidence/issue_139_quality_gate/corpus_manifest.tsv`
- each registered file must have a fixed transcript in `docs/_evidence/issue_139_quality_gate/reference_transcripts/<family>/`
- each family must be expandable to satisfy difficult subset size `>= N_min`

### 7.4 Per-family execution

For each family:

1. run baseline with all operations `off`
2. classify difficult files where `CER_off >= D`
3. ensure difficult subset size `>= N_min` (expand corpus if needed)
4. run tested non-off config sets:
   - `auto`
   - at least one bounded `manual` config (unless exactly equivalent validated results are reused under section 7.6)
5. compute per-file values:
   - `CER_off`
   - `CER_nonoff`
   - `deltaCER = CER_off - CER_nonoff`
   - improved (`deltaCER > 0`)
6. compute family aggregates for each tested non-off config:
   - `median_improvement = median(deltaCER)`
   - `share_improved = % files with deltaCER > 0`
7. family passes only if at least one tested non-off config satisfies:
   - `median_improvement >= M`
   - `share_improved >= S`

### 7.5 Required per-family evidence table contract

Each family table must include at minimum:

- `file_id`
- baseline config id (`off`)
- tested non-off config id (`auto` or manual-id)
- `CER_off`
- `CER_nonoff`
- `deltaCER`
- `improved` (`yes|no`)
- runtime (elapsed processing time for baseline/non-off run)
- artifact/sample references (input file path + transcript path + run artifact path)

Family closure row must include:

- difficult subset size used for scoring
- `median_improvement`
- `share_improved`
- pass/fail against requirement #5 (`median_improvement >= M` AND `share_improved >= S`)

### 7.6 Smoke-to-quality reuse rules

- reuse smoke runs when they satisfy the exact scoring pipeline and transcript requirements
- do not re-run equivalent scenarios without added measurement value
- if reuse is partial, run only missing benchmark cases

## 8) Phase D - Evidence and Checklist Closure

### 8.1 Smoke evidence artifacts

Recommended folder:

- `docs/_evidence/issue_139_batch3_smoke/`

Required per scenario:

- [ ] OCR options screenshot showing preprocess config
- [ ] progress/terminal screenshot or payload capture
- [ ] observed stage sequence
- [ ] terminal code/result
- [ ] text mutation check result

### 8.2 Quality evidence artifacts

Store all generated CER/summary tables under:

- `docs/_evidence/issue_139_quality_gate/`

Mandatory closure evidence:

- [ ] constants file created before runs
- [ ] reference transcripts present for all benchmark files
- [ ] difficult-subset size evidence per family
- [ ] per-file CER tables per family (including runtime and artifact/sample references)
- [ ] pass/fail status per family against requirement #5
- [ ] consolidated summary JSON

### 8.3 Checklist sync in issue file

Close only when evidence exists:

- `Run in-app smoke and record evidence` block in `docs/issues/Issue_139.md`
- `Execute and pass mandatory quality gate immediately after smoke` block in `docs/issues/Issue_139.md`

## 9) Logging Policy for Diagnostics (Only If Needed)

Default:

- do not add temporary logs unless existing artifacts are insufficient to diagnose

If temporary logs are necessary, they must follow:

- `electron/log.js`
- `public/js/log.js`

Rules:

- use `Log.get('<scope>')` in main and `window.getLogger('<scope>')` in renderer
- call logger methods directly (`warn`, `warnOnce`, `error`, `errorOnce`, `info`, `debug`)
- keep warning/error diagnostics in English
- for once-logs, use explicit stable dedupe keys
- never use per-run dynamic data in dedupe keys

Required cleanup:

- remove smoke/quality temporary logs before closure
- rerun `npm run lint`
- record add/remove log actions in evidence

## 10) Evidence Entry Template (Codex)

When appending to `docs/_evidence/issue_139_evidence.md`, include:

- timestamp
- phase (`smoke` or `quality_gate`)
- scenario/family id
- input file ids
- preprocess config used
- stage sequence and terminal result
- text mutation result
- CER metrics (for quality): per-file + family aggregates
- runtime metrics per family/config
- artifact file references

## 11) Smoke/Quality Gate Exit Condition

The `Smoke test and quality gate` section is complete only when both blocks are fully checked in `docs/issues/Issue_139.md`:

- smoke block complete
- quality-gate block complete

If any challenging family fails the quality gate thresholds, the smoke/quality-gate section remains open and Batch 4 stays blocked.

