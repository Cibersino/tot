# Issue 139 Evidence Log

## 2026-03-06 - Smoke/Quality-Gate Preflight + Section 4 Artifact Scaffolding

Entry `E139-SQG-SETUP-001`
- timestamp: `2026-03-06 20:29:56 -03:00`
- command/test executed:
  - preflight commands (runbook Phase A):
    - `npm run lint`
    - `node --check public/js/import_ocr_ui.js`
    - `node --check public/js/import_ocr_ui_options_modal.js`
    - `node --check public/js/import_ocr_ui_progress.js`
    - `node --check electron/import_ocr/orchestrator.js`
    - `node --check electron/import_ocr/ocr_pipeline.js`
    - `node --check electron/import_ocr/pdf_raster_ocr.js`
    - `node --check electron/import_ocr/preprocess_runtime.js`
  - section 4 audit:
    - item-by-item existence check for `4.1` and `4.3` required files from `docs/issues/Issue_139_Smoke_Quality_Gate_Verification_Guide.md`.
  - section 4 scaffolding:
    - created artifact directories:
      - `docs/_evidence/issue_139_batch3_smoke/`
      - `docs/_evidence/issue_139_quality_gate/corpus/{photographed,scanned_pdf,noisy_low_contrast}/`
      - `docs/_evidence/issue_139_quality_gate/reference_transcripts/{photographed,scanned_pdf,noisy_low_contrast}/`
    - created bootstrap files:
      - `docs/_evidence/issue_139_quality_gate/quality_gate_constants.json`
      - `docs/_evidence/issue_139_quality_gate/corpus_manifest.tsv`
      - `docs/_evidence/issue_139_quality_gate/results_off.tsv`
      - `docs/_evidence/issue_139_quality_gate/results_nonoff.tsv`
      - `docs/_evidence/issue_139_quality_gate/cer_table_photographed.tsv`
      - `docs/_evidence/issue_139_quality_gate/cer_table_scanned_pdf.tsv`
      - `docs/_evidence/issue_139_quality_gate/cer_table_noisy_low_contrast.tsv`
      - `docs/_evidence/issue_139_quality_gate/quality_gate_summary.json`
- result:
  - preflight commands passed.
  - section `4.1` checklist prerequisites are present.
  - section `4.3` scaffold files now exist, but family corpus inputs and transcript files are still pending population.
  - smoke-subset selection (`4.2`) remains pending until manifest rows are populated with real file ids.
- artifact/log reference:
  - `docs/issues/Issue_139_Smoke_Quality_Gate_Verification_Guide.md`
  - `docs/_evidence/issue_139_evidence.md`
  - `docs/_evidence/issue_139_batch3_smoke/`
  - `docs/_evidence/issue_139_quality_gate/quality_gate_constants.json`
  - `docs/_evidence/issue_139_quality_gate/corpus_manifest.tsv`
  - `docs/_evidence/issue_139_quality_gate/results_off.tsv`
  - `docs/_evidence/issue_139_quality_gate/results_nonoff.tsv`
  - `docs/_evidence/issue_139_quality_gate/cer_table_photographed.tsv`
  - `docs/_evidence/issue_139_quality_gate/cer_table_scanned_pdf.tsv`
  - `docs/_evidence/issue_139_quality_gate/cer_table_noisy_low_contrast.tsv`
  - `docs/_evidence/issue_139_quality_gate/quality_gate_summary.json`

Entry `E139-SQG-SETUP-002`
- timestamp: `2026-03-06 20:31:32 -03:00`
- command/test executed:
  - generated seed corpus files (one per family) from existing issue artifact:
    - source: `docs/_evidence/issue_139_operation_gate/input_sample.png`
    - output:
      - `docs/_evidence/issue_139_quality_gate/corpus/photographed/photo_seed_001.png`
      - `docs/_evidence/issue_139_quality_gate/corpus/noisy_low_contrast/noisy_seed_001.png` (ImageMagick low-contrast/noise transform)
      - `docs/_evidence/issue_139_quality_gate/corpus/scanned_pdf/scanned_seed_001.pdf` (ImageMagick PNG -> PDF conversion)
  - created transcript placeholders:
    - `docs/_evidence/issue_139_quality_gate/reference_transcripts/photographed/photo_seed_001.txt`
    - `docs/_evidence/issue_139_quality_gate/reference_transcripts/scanned_pdf/scanned_seed_001.txt`
    - `docs/_evidence/issue_139_quality_gate/reference_transcripts/noisy_low_contrast/noisy_seed_001.txt`
  - populated manifest with one file id per family:
    - `photo_seed_001`
    - `scanned_seed_001`
    - `noisy_seed_001`
    - file: `docs/_evidence/issue_139_quality_gate/corpus_manifest.tsv`
  - normalized manifest delimiter format to real tab-separated columns (`5` columns per row).
  - rechecked section 4 artifact existence:
    - corpus + transcript globs now return `matches=1` per family.
- result:
  - runbook section 4 file/artifact checklist is now physically scaffolded and non-empty for all three families.
  - smoke-subset preselection is now registered in manifest (`4.2` minimum one id per family).
  - drift disclosure: transcript files are placeholders (`TODO`) and are not final ground-truth references; quality-gate scoring cannot be closed until these are replaced with fixed true transcripts and corpus is expanded to satisfy `N_min`.
- artifact/log reference:
  - `docs/_evidence/issue_139_operation_gate/input_sample.png`
  - `docs/_evidence/issue_139_quality_gate/corpus/photographed/photo_seed_001.png`
  - `docs/_evidence/issue_139_quality_gate/corpus/scanned_pdf/scanned_seed_001.pdf`
  - `docs/_evidence/issue_139_quality_gate/corpus/noisy_low_contrast/noisy_seed_001.png`
  - `docs/_evidence/issue_139_quality_gate/reference_transcripts/photographed/photo_seed_001.txt`
  - `docs/_evidence/issue_139_quality_gate/reference_transcripts/scanned_pdf/scanned_seed_001.txt`
  - `docs/_evidence/issue_139_quality_gate/reference_transcripts/noisy_low_contrast/noisy_seed_001.txt`
  - `docs/_evidence/issue_139_quality_gate/corpus_manifest.tsv`

## 2026-03-06 - Batch 3 UI Controls + PreprocessConfig Wiring

Entry `E139-B3-UI-003`
- timestamp: `2026-03-06 15:55:18 -03:00`
- command/test executed:
  - syntax checks:
    - `node --check public/js/import_ocr_ui_shared.js`
    - `node --check public/js/import_ocr_ui_options_modal.js`
    - `node --check public/js/import_ocr_ui.js`
  - locale JSON parse checks:
    - `Get-Content -Path i18n/en/renderer.json -Raw | ConvertFrom-Json | Out-Null`
    - `Get-Content -Path i18n/es/renderer.json -Raw | ConvertFrom-Json | Out-Null`
  - lint verification:
    - `npm run lint`
  - wiring/persistence scans:
    - `rg -n "preprocessConfig|collectNormalizedPreprocessConfig|resetPreprocessControlsForNewRun|setAllPreprocessOperationsOff|normalizePreprocessControlValues" public/js/import_ocr_ui_options_modal.js public/js/import_ocr_ui.js public/js/import_entry.js`
    - `rg -n "preprocessConfig" electron public/js public/renderer.js`
    - `rg -n "preprocessConfig|preprocess" electron/settings.js electron/main.js public/renderer.js public/js/import_ocr_ui.js`
- result:
  - OCR options modal now exposes Batch 3 preprocess controls for all H01 operations (`normalize_contrast`, `binarize`, `denoise`, `deskew`, `page_cleanup`) with per-operation mode selector (`off|auto|manual`) and bounded manual fields.
  - explicit `set all off` action is implemented in modal UI.
  - modal now emits canonical `preprocessConfig` in OCR run options; backend integration path remains: renderer options -> `import-run` payload -> `ocr_pipeline` preprocess validation -> `preprocess_runtime` execution.
  - preprocess default state is reset to all operations `off` on every new OCR options prompt via `resetPreprocessControlsForNewRun`.
  - no preprocess persistence path was introduced in renderer/main settings flow (`settings` codepaths contain no preprocess config storage wiring).
  - default-off and no-persistence checklist verification in this entry is code-path verification (not in-app restart/file-change smoke).
  - EN/ES OCR options preprocess UI strings were added; preprocess stage + preprocess error strings remain present.
- artifact/log reference:
  - `public/index.html`
  - `public/style.css`
  - `public/js/import_ocr_ui_shared.js`
  - `public/js/import_ocr_ui_options_modal.js`
  - `public/js/import_ocr_ui.js`
  - `i18n/en/renderer.json`
  - `i18n/es/renderer.json`
  - `public/renderer.js`
  - `electron/import_ocr/ocr_pipeline.js`
  - `electron/import_ocr/preprocess_runtime.js`
  - `docs/issues/Issue_139.md`

## 2026-03-06 - Batch 2 Runtime Artifacts + Operation Compatibility Gate (H01)

Entry `E139-B2-GATE-002`
- timestamp: `2026-03-06 15:32:36 -03:00`
- command/test executed:
  - copied selected preprocess runtime artifacts into sidecar paths:
    - source `C:\Program Files\ImageMagick-7.1.2-Q16-HDRI\*` -> `ocr/win32-x64/preprocess/imagemagick/`
    - source `C:\ProgramData\chocolatey\lib\unpaper\tools\{unpaper.exe,LIBBZ2-1.DLL,LIBWINPTHREAD-1.DLL,ZLIB1.DLL}` -> `ocr/win32-x64/preprocess/unpaper/`
  - runtime verification:
    - `ocr/win32-x64/preprocess/imagemagick/magick.exe -version`
    - `ocr/win32-x64/preprocess/unpaper/unpaper.exe --version`
    - inventory count/size check for copied sidecar trees
  - compatibility-fix probe and runtime adjustment:
    - identified unpaper runtime constraints (`unsupported pixel format` for default PNM conversion; unsupported `--clean` option)
    - updated preprocess runtime to use grayscale 8-bit PGM in/out for unpaper operations and adjusted `page_cleanup` presets to supported unpaper options
  - Operation Compatibility Gate execution:
    - generated sample input artifact:
      - `magick ... docs/_evidence/issue_139_operation_gate/input_sample.png`
    - ran full gate script (all scoped operations) to verify:
      - runtime availability
      - `off|auto|manual` success per operation
      - applied-proof via per-op stats + output hash change checks
      - forced-failure mapping (`OCR_BINARY_MISSING`, `OCR_PREPROCESS_FAILED` via input-cap exceed, `OCR_PREPROCESS_CANCELED`)
    - gate report artifact:
      - `docs/_evidence/issue_139_operation_gate/operation_gate_report.json`
      - summary: `runtimeAvailable=true`, `allModesSucceeded=true`, `appliedProofAutoManual=true`, `forcedFailureMappingsOk=true`
  - provenance/hash capture:
    - generated preprocess inventory + sha256 list:
      - `docs/_evidence/issue_139_operation_gate/win32_preprocess_inventory.tsv`
    - generated provenance hash snapshot:
      - `docs/_evidence/issue_139_operation_gate/provenance_hash_snapshot.json`
    - recorded provenance narrative and source-link/checksum chain:
      - `docs/_evidence/issue_139_operation_gate/provenance.md`
- result:
  - bundled preprocess sidecar artifacts are now established under required active-target layout:
    - `ocr/win32-x64/preprocess/imagemagick/**`
    - `ocr/win32-x64/preprocess/unpaper/**`
  - preprocess runtime compatibility gate passes for all H01 scoped operations and modes (`off|auto|manual`) with forced-failure mapping checks passing.
  - issue checklist Batch 2 items for runtime artifact establishment, provenance recording, and compatibility gate are now closed.
- artifact/log reference:
  - `ocr/win32-x64/preprocess/imagemagick/magick.exe`
  - `ocr/win32-x64/preprocess/unpaper/unpaper.exe`
  - `electron/import_ocr/preprocess_runtime.js`
  - `docs/_evidence/issue_139_operation_gate/input_sample.png`
  - `docs/_evidence/issue_139_operation_gate/operation_gate_report.json`
  - `docs/_evidence/issue_139_operation_gate/win32_preprocess_inventory.tsv`
  - `docs/_evidence/issue_139_operation_gate/provenance_hash_snapshot.json`
  - `docs/_evidence/issue_139_operation_gate/provenance.md`
  - `docs/issues/Issue_139.md`

## 2026-03-06 - Batch 2 Runtime + Integration (H01)

Entry `E139-B2-INTEGRATION-001`
- timestamp: `2026-03-06 15:02:11 -03:00`
- command/test executed:
  - syntax checks:
    - `node --check electron/import_ocr/preprocess_runtime.js`
    - `node --check electron/import_ocr/ocr_pipeline.js`
    - `node --check electron/import_ocr/pdf_raster_ocr.js`
    - `node --check electron/import_ocr/platform/profile_registry.js`
    - `node --check electron/import_ocr/platform/resolve_sidecar.js`
    - `node --check electron/import_ocr/orchestrator.js`
    - `node --check public/js/import_ocr_ui_progress.js`
    - `node --check public/renderer.js`
  - locale parse checks:
    - `Get-Content -Path i18n/en/renderer.json -Raw | ConvertFrom-Json | Out-Null`
    - `Get-Content -Path i18n/es/renderer.json -Raw | ConvertFrom-Json | Out-Null`
    - `Get-Content -Path i18n/es/es-cl/renderer.json -Raw | ConvertFrom-Json | Out-Null`
  - runtime/path sanity probes:
    - `resolve_sidecar_preprocess_paths_ok` inline script (verifies `resolveSidecarPaths` emits preprocess binary paths for `win32-x64`)
    - `preprocess_off_mode_smoke_ok` inline script (verifies all-operations-off preprocess path returns input unchanged and succeeds without preprocess binaries)
  - no-legacy scan:
    - `rg -n "preprocessProfile|ocrPreprocess|preprocess_basic|preprocess_standard|preprocess_aggressive|OCR_PREPROCESS_LIST|normalizePreprocessProfile" public electron i18n`
- result:
  - Batch 2 runtime integration is wired end-to-end:
    - image OCR route now executes preprocessing stage before OCR and cleans temp artifacts on terminal states.
    - scanned-PDF OCR now runs per-page preprocessing after rasterization and before Tesseract; failures are fail-fast with typed preprocess codes.
    - preprocess sidecar paths are resolved explicitly from profile root (`preprocess/imagemagick`, `preprocess/unpaper`) with no `PATH` discovery.
    - preprocess typed errors are mapped to renderer user-facing alerts, and `preprocessing` progress stage is visible in UI progress labels.
    - `OCR_PREPROCESS_CANCELED` is treated as canceled terminal state in orchestrator/progress UI.
  - clean-base invariant remains true (legacy preprocess-profile identifiers absent in active code paths).
  - preprocess sidecar directory contract skeleton added for target keys:
    - `ocr/win32-x64/preprocess/imagemagick/.gitkeep`
    - `ocr/win32-x64/preprocess/unpaper/.gitkeep`
    - `ocr/linux-x64/preprocess/.gitkeep`
    - `ocr/darwin-x64/preprocess/.gitkeep`
    - `ocr/darwin-arm64/preprocess/.gitkeep`
- artifact/log reference:
  - `electron/import_ocr/preprocess_runtime.js`
  - `electron/import_ocr/ocr_pipeline.js`
  - `electron/import_ocr/pdf_raster_ocr.js`
  - `electron/import_ocr/orchestrator.js`
  - `electron/import_ocr/platform/profile_registry.js`
  - `electron/import_ocr/platform/resolve_sidecar.js`
  - `public/js/import_ocr_ui_progress.js`
  - `public/renderer.js`
  - `i18n/en/renderer.json`
  - `i18n/es/renderer.json`
  - `i18n/es/es-cl/renderer.json`
  - `ocr/README.md`
  - `ocr/win32-x64/preprocess/imagemagick/.gitkeep`
  - `ocr/win32-x64/preprocess/unpaper/.gitkeep`
  - `ocr/linux-x64/preprocess/.gitkeep`
  - `ocr/darwin-x64/preprocess/.gitkeep`
  - `ocr/darwin-arm64/preprocess/.gitkeep`
  - `docs/issues/Issue_139.md`

## 2026-03-06 - Batch 1 Contract Core Closure (H01)

Entry `E139-B1-CONTRACT-002`
- timestamp: `2026-03-06 14:46:06 -03:00`
- command/test executed:
  - `node --check electron/import_ocr/preprocess_pipeline.js`
  - `node --check electron/import_ocr/ocr_pipeline.js`
  - contract sanity script (`preprocess_pipeline_sanity_ok`)
  - exclusion checks script (`preprocess_pipeline_exclusions_ok`)
  - `rg -n "preprocessProfile|ocrPreprocess|preprocess_basic|preprocess_standard|preprocess_aggressive|OCR_PREPROCESS_LIST|normalizePreprocessProfile" public electron i18n`
- result:
  - new Batch 1 preprocess contract module and OCR pipeline wiring pass syntax checks.
  - manual-schema validation, strict unknown-key rejection, adapter input validation, and runner JSON output foundations behave as expected in scripted checks.
  - first-cut exclusion constraints are enforced (`split`/extra operation keys rejected; free-form passthrough keys such as `cliArgs` rejected in adapter input).
  - no legacy preprocess profile references detected in active app code paths.
- artifact/log reference:
  - `electron/import_ocr/preprocess_pipeline.js`
  - `electron/import_ocr/ocr_pipeline.js`
  - `docs/issues/Issue_139.md`

Entry `E139-B1-CONTRACT-001`
- timestamp: `2026-03-06 14:20:00 -03:00` to `2026-03-06 14:46:06 -03:00`
- command/test executed:
  - implemented H01 scoped-lock operation registry + fixed order + tool ownership.
  - implemented strict `preprocessConfig` validation/normalization with bounded manual schemas and unknown-key rejection.
  - implemented adapter contract foundation (`buildPreprocessAdapterInput`) with strict key enforcement.
  - implemented runner JSON output foundation (`buildPreprocessRunnerJsonOutput`) with per-operation stats (`requestedMode`, `effectiveMode`, `applied`, `skipped`, `params`, `durationMs`).
  - wired strict backend preprocess validation at OCR pipeline entry.
- result:
  - Batch 1 checklist items are now implemented and marked complete in issue checklist.
  - default `preprocessConfig` now resolves to all operations `off` when omitted.
  - low-impact assumption applied for manual bounds (not numerically specified in issue text): conservative initial bounds were defined in code constants and are centrally change-controlled for later evidence-driven tuning.
- artifact/log reference:
  - `docs/issues/Issue_139.md`
  - `electron/import_ocr/preprocess_pipeline.js`
  - `electron/import_ocr/ocr_pipeline.js`

## 2026-03-06 - Clean-Base Start Gate Closure

Entry `E139-CLEANBASE-002`
- timestamp: `2026-03-06 13:52:58 -03:00`
- command/test executed:
  - `rg -n "preprocessProfile|ocrPreprocess|preprocess_label|preprocess_basic|preprocess_standard|preprocess_aggressive|normalizePreprocessProfile|OCR_PREPROCESS_LIST|preprocessConfig" public electron i18n`
  - `node --check public/js/import_ocr_ui_shared.js`
  - `node --check public/js/import_ocr_ui_options_modal.js`
  - `node --check public/js/import_ocr_ui.js`
  - `node --check public/js/import_ocr_ui_progress.js`
  - `node --check public/js/import_entry.js`
  - `node --check public/renderer.js`
  - JSON parse verification for all locale files:
    - `Get-ChildItem -Path i18n -Recurse -Filter renderer.json | ForEach-Object { Get-Content -Path $_.FullName -Raw | ConvertFrom-Json | Out-Null }`
- result:
  - legacy preprocess profile identifiers and selector/i18n keys return zero matches in active app code paths (`public`, `electron`, `i18n`).
  - edited renderer-side JS modules pass syntax checks.
  - all locale `renderer.json` files parse successfully after legacy-key removal.
  - no Batch 1 preprocess-contract implementation (`preprocessConfig`) was introduced during Clean-Base closure.
- artifact/log reference:
  - `public/index.html`
  - `public/js/import_ocr_ui_shared.js`
  - `public/js/import_ocr_ui_options_modal.js`
  - `public/js/import_ocr_ui.js`
  - `public/js/import_ocr_ui_progress.js`
  - `public/js/import_entry.js`
  - `public/renderer.js`
  - `i18n/en/renderer.json`
  - `i18n/es/renderer.json`
  - `i18n/es/es-cl/renderer.json`
  - `i18n/de/renderer.json`
  - `i18n/fr/renderer.json`
  - `i18n/it/renderer.json`
  - `i18n/pt/renderer.json`
  - `i18n/arn/renderer.json`

Entry `E139-CLEANBASE-001`
- timestamp: `2026-03-06 13:40:00 -03:00` to `2026-03-06 13:52:58 -03:00`
- command/test executed:
  - removed legacy preprocess profile selector/options from OCR modal markup.
  - removed legacy `preprocessProfile` queue/progress payload wiring.
  - removed legacy preprocess-normalization/estimation paths from shared OCR UI helpers.
  - removed legacy preprocess i18n keys across all active locales.
- result:
  - Clean-Base hard-cut is now applied in renderer/UI paths (no `basic|standard|aggressive` preprocess profile model remains in active OCR flow).
  - issue checklist Clean-Base gate items are updated to closed state.
- artifact/log reference:
  - `docs/issues/Issue_139.md`
  - `public/index.html`
  - `public/js/import_ocr_ui_shared.js`
  - `public/js/import_ocr_ui_options_modal.js`
  - `public/js/import_ocr_ui.js`
  - `public/js/import_ocr_ui_progress.js`
  - `public/js/import_entry.js`
  - `public/renderer.js`
  - `i18n/en/renderer.json`
  - `i18n/es/renderer.json`
  - `i18n/es/es-cl/renderer.json`
  - `i18n/de/renderer.json`
  - `i18n/fr/renderer.json`
  - `i18n/it/renderer.json`
  - `i18n/pt/renderer.json`
  - `i18n/arn/renderer.json`

## 2026-03-06 - Batch 1 User Setup Gate (H01) Completion

Entry `E139-B1-SETUP-002`
- timestamp: `2026-03-06 12:18:59 -03:00`
- command/test executed:
  - `Get-Command magick`
  - `Get-Command unpaper`
  - `magick -version`
  - `unpaper --version`
  - explicit binary/path checks:
    - `C:\Program Files\ImageMagick-7.1.2-Q16-HDRI\magick.exe -version`
    - `C:\ProgramData\chocolatey\lib\unpaper\tools\unpaper.exe --version`
- result:
  - `unpaper` is available on `PATH` via Chocolatey shim (`C:\ProgramData\chocolatey\bin\unpaper.exe`) and reports version `6.1`.
  - `magick` is not available on `PATH` in this already-open shell session, but the installed binary exists and runs at:
    - `C:\Program Files\ImageMagick-7.1.2-Q16-HDRI\magick.exe`
    - version line: `ImageMagick 7.1.2-15 Q16-HDRI x64`.
  - selected-path prerequisites (`ImageMagick`, `unpaper`) are now locally installed and version-verifiable.
- artifact/log reference: `docs/issues/Issue_139.md` (Batch 1 User Setup Gate checklist), this session command output.

Entry `E139-B1-SETUP-001`
- timestamp: `2026-03-06 12:16:58 -03:00` to `2026-03-06 12:17:48 -03:00`
- command/test executed (user-performed install step after initial missing-prerequisite check):
  - `choco install imagemagick --yes`
  - `choco install unpaper --yes`
- result:
  - Chocolatey reported successful install of:
    - `imagemagick v7.1.2.1500` (deployed under `C:\Program Files\ImageMagick-7.1.2-Q16-HDRI\`)
    - `unpaper v6.1.0` (deployed under `C:\ProgramData\chocolatey\lib\unpaper\tools`, shim created for `unpaper.exe`)
  - User Setup Gate "if missing, execute guided user download/install steps" is satisfied.
- artifact/log reference: user terminal transcript in this Issue 139 session; `C:\ProgramData\chocolatey\logs\chocolatey.log` (`The install of imagemagick.app was successful` at `12:16:58`, `The install of imagemagick was successful` at `12:16:59`, `The install of unpaper was successful` at `12:17:48`).

## 2026-03-06 - Pre-Implementation Decision Gate Closure Pass

Entry `E139-SUBSTRATE-004`
- timestamp: `2026-03-06 10:23:56 -03:00`
- command/test executed: added explicit "non-negotiables" checklist in issue + matrix evidence for H01 carry-forward constraints.
- result:
  - issue now includes a compact implementation guardrail list under H01 substrate conditions.
  - matrix evidence now includes a matching non-negotiables snapshot to prevent drift between issue and evidence wording.
- artifact/log reference: `docs/issues/Issue_139.md:189`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:586`.

Entry `E139-SUBSTRATE-003`
- timestamp: `2026-03-06 10:15:52 -03:00`
- command/test executed: section-anchor verification in issue + matrix evidence docs (line-located checks).
- result:
  - issue now contains explicit H01 substrate conditions section at line `185`.
  - issue now records Batch 1 substrate-constraints documentation item checked at line `416`.
  - matrix evidence now contains H01 substrate conditions readout at line `582`.
- artifact/log reference: `docs/issues/Issue_139.md:185`, `docs/issues/Issue_139.md:416`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:582`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:593`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:613`.

Entry `E139-SUBSTRATE-002`
- timestamp: `2026-03-06 10:15:52 -03:00`
- command/test executed:
  - `Get-ChildItem -Path ocr/win32-x64/preprocess -Force`
  - `Select-String -Path package.json -Pattern "\"extraResources\"|\"from\": \"ocr\"|\"to\": \"ocr\""`
  - `Select-String -Path electron/import_ocr/platform/profile_registry.js -Pattern "'win32-x64'|'linux-x64'|'darwin-x64'|'darwin-arm64'"`
  - `Get-ChildItem -Path third_party_licenses -Recurse -File`
- result:
  - `ocr/win32-x64/preprocess` currently has no committed files (empty state confirmed).
  - packaging config includes `ocr/**` via `extraResources` (`from: "ocr"`, `to: "ocr"`).
  - target registry contains all four target keys (`win32-x64`, `linux-x64`, `darwin-x64`, `darwin-arm64`).
  - current `third_party_licenses/**` contains `poppler` and `tesseract` only (no ImageMagick/unpaper license files yet).
- artifact/log reference: `package.json:33`, `package.json:35`, `package.json:36`, `electron/import_ocr/platform/profile_registry.js:19`, `electron/import_ocr/platform/profile_registry.js:27`, `electron/import_ocr/platform/profile_registry.js:35`, `electron/import_ocr/platform/profile_registry.js:43`.

Entry `E139-SUBSTRATE-001`
- timestamp: `2026-03-06 10:15:52 -03:00`
- command/test executed: upstream-source review for selected substrate obligations.
- result:
  - ImageMagick license page reviewed for redistribution notice obligations.
  - unpaper repository reviewed for project license declaration and hard FFmpeg dependency note.
  - These source constraints are now reflected as carry-forward requirements in issue + matrix evidence.
- artifact/log reference: `https://imagemagick.org/license/`, `https://github.com/unpaper/unpaper`, `docs/issues/Issue_139.md:189`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:586`.

Entry `E139-GATE-005`
- timestamp: `2026-03-06 10:00:16 -03:00`
- command/test executed: `Get-Content docs/issues/Issue_139.md` line-range verification for the Pre-Implementation Decision Gate checklist.
- result:
  - gate checklist lines `378-385` now set to checked (`[x]`) for all decision-gate items.
  - Batch 1 setup items remain unchecked as expected.
- artifact/log reference: `docs/issues/Issue_139.md:377`, `docs/issues/Issue_139.md:378`, `docs/issues/Issue_139.md:379`, `docs/issues/Issue_139.md:382`, `docs/issues/Issue_139.md:384`, `docs/issues/Issue_139.md:388`.

Entry `E139-GATE-004`
- timestamp: `2026-03-06 09:59:16 -03:00`
- command/test executed: evidence content update in `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md` (frozen lists/order, per-candidate criteria outcomes, capability-gap conclusion, non-selected scope).
- result:
  - gate checkboxes `1-4` now have explicit evidence sections.
  - selection path remains `H01`; challenger remains `H05`.
- artifact/log reference: `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:18`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:472`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:513`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:532`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:559`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:560`.

Entry `E139-GATE-003`
- timestamp: `2026-03-06 09:59:16 -03:00`
- command/test executed: `Select-String -Path docs/issues/Issue_139.md -Pattern "### Pre-Implementation Decision Gate|Define bundled/custom candidate lists and freeze evaluation order in evidence|Evaluate candidates against decision-gate criteria|Run capability-gap analysis from candidate results and record evidence|Keep non-selected candidate evidence light"`
- result:
  - decision-gate checklist block located at lines `377-385`
  - pending checkbox lines confirmed before final sync: `378`, `379`, `382`, `384`
- artifact/log reference: `docs/issues/Issue_139.md:377`, `docs/issues/Issue_139.md:378`, `docs/issues/Issue_139.md:379`, `docs/issues/Issue_139.md:382`, `docs/issues/Issue_139.md:384`.

Entry `E139-GATE-002`
- timestamp: `2026-03-06 09:59:16 -03:00`
- command/test executed: `Select-String -Path docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md -Pattern "Frozen Candidate Lists \+ Evaluation Order|Per-Candidate Gate Results|Capability-Gap Analysis from Candidate Results|Non-Selected Candidate Evidence Scope|Revised Readout|Conclusion \(Gate Closure\)|Selected now" -CaseSensitive:$false`
- result:
  - freeze/order section present at line `18`
  - per-candidate gate results section present at line `472`
  - capability-gap analysis section present at line `513`
  - non-selected light-evidence section present at line `532`
  - revised readout section present at line `548`
  - selected-path line (`H01`) present at line `559`
  - gate-closure conclusion section present at line `570`
- artifact/log reference: `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:18`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:472`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:513`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:532`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:548`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:559`, `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md:570`.

Entry `E139-GATE-001`
- timestamp: `2026-03-06 09:56:59 -03:00`
- command/test executed: `Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"`
- result: session timestamp captured for gate-closure evidence entries.
- artifact/log reference: `docs/_evidence/issue_139_evidence.md` (this entry), `docs/_evidence/issue_139_preimpl_candidate_matrix_draft.md`.
