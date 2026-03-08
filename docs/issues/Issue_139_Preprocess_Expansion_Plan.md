# Issue 139 - Preprocess Expansion Plan (H01 Artifacts Only)

## Objective

Expand OCR preprocessing beyond the current minimal set, but only with options that:

1. are supported by shipped artifacts (`ImageMagick 7.1.2-15`, `unpaper 6.1`),
2. fit the existing strict `preprocessConfig` contract (bounded/manual-safe),
3. preserve deterministic 1-input -> 1-output behavior.

## Scope

In scope:

1. Add operation: `local_illumination_correction` (ImageMagick `-lat`).
2. Add operation: `adaptive_contrast` (ImageMagick `-clahe`).
3. Add operation: `text_sharpen` (ImageMagick `-unsharp`).
4. Expand `page_cleanup.manual` from `cleanLevel` presets to bounded direct knobs supported by shipped `unpaper`.
5. Update UI, validation, runtime mapping, i18n, and evidence/gate docs for new options.
6. Re-run smoke + mandatory quality gate with baseline vs non-off configs.

Out of scope:

1. Multi-file `unpaper` workflows (`--input-pages 2`, `--output-pages 2`, sequence patterns).
2. Unsupported flags in shipped `unpaper.exe` (`--clean`, `--split`).
3. Free-form CLI passthrough.
4. Unbounded/manual geometry editing controls that can remove text (split/mask/wipe/manual crop/border-layout transforms).
5. True perspective/page-curl dewarp requiring free-form control geometry.

## Current Baseline (to preserve)

Current operation keys and order:

1. `normalize_contrast`
2. `binarize`
3. `denoise`
4. `deskew`
5. `page_cleanup`

Current strict guardrails to keep:

1. Unknown operation keys rejected.
2. Unknown manual fields rejected.
3. No silent fallback.
4. Missing preprocess runtime maps to `OCR_BINARY_MISSING`.
5. Preprocess failures map to typed `OCR_PREPROCESS_*`.

## Proposed Contract Update

### New operation keys

Add these keys to operation registry and UI:

1. `local_illumination_correction` (ImageMagick)
2. `adaptive_contrast` (ImageMagick)
3. `text_sharpen` (ImageMagick)

### Revised operation order

Use fixed order:

1. `normalize_contrast`
2. `local_illumination_correction`
3. `adaptive_contrast`
4. `binarize`
5. `denoise`
6. `text_sharpen`
7. `deskew`
8. `page_cleanup`

Rationale:

1. illumination/contrast normalization before thresholding,
2. thresholding before cleanup filters,
3. geometric correction near pipeline end,
4. page cleanup last to avoid reintroducing artifacts before OCR.

### Manual schema proposal (bounded)

`local_illumination_correction.manual`:

1. `windowPx` (integer, 9..101, odd-step UI guidance)
2. `offsetPct` (number, 1..30)

`adaptive_contrast.manual`:

1. `tilePct` (number, 5..40)
2. `clipLimit` (number, 1..8)
3. `bins` (integer, 64..256)

`text_sharpen.manual`:

1. `radiusPx` (number, 0..2)
2. `sigmaPx` (number, 0.3..3)
3. `amount` (number, 0.2..2)
4. `threshold` (number, 0..0.2)

`page_cleanup.manual` (replace `cleanLevel` with direct bounded fields):

1. `maskScanSize` (integer, 10..80)
2. `grayfilterSize` (integer, 0..12)
3. `noisefilterIntensity` (integer, 0..12)
4. `blackfilterIntensity` (integer, 0..32)
5. `blurfilterSize` (integer, 0..12)

Note:

1. `0` values on some fields act as disabled/minimal behavior where supported.
2. Bounds must be enforced in renderer and backend.

## Runtime Mapping Plan

## ImageMagick operations

`local_illumination_correction`:

1. `auto`: `-lat 25x25+10%`
2. `manual`: `-lat <windowPx>x<windowPx>+<offsetPct>%`

`adaptive_contrast`:

1. `auto`: `-clahe 25x25%+128+3`
2. `manual`: `-clahe <tilePct>x<tilePct>%+<bins>+<clipLimit>`

`text_sharpen`:

1. `auto`: `-unsharp 0x1+1+0`
2. `manual`: `-unsharp <radiusPx>x<sigmaPx>+<amount>+<threshold>`

## unpaper operations

`page_cleanup`:

1. `auto`: keep safe preset (`--layout single --mask-scan-size 50`).
2. `manual`: map direct bounded params into existing supported flags:
   1. `--layout single`
   2. `--mask-scan-size <maskScanSize>`
   3. include `--grayfilter-size` only when `grayfilterSize > 0`
   4. include `--noisefilter-intensity` only when `noisefilterIntensity > 0`
   5. include `--blackfilter-intensity` only when `blackfilterIntensity > 0`
   6. include `--blurfilter-size` only when `blurfilterSize > 0`

## Implementation Workstreams

### Batch A - Contract + Validation

1. Update `H01_OPERATION_ORDER` and `H01_OPERATION_REGISTRY` in `electron/import_ocr/preprocess_pipeline.js`.
2. Add schemas/default-off for new keys.
3. Replace `page_cleanup.manual.cleanLevel` schema with explicit bounded fields.
4. Keep strict unknown-key rejection behavior.

### Batch B - Runtime Adapter

1. Extend `buildMagickOperationArgs()` in `electron/import_ocr/preprocess_runtime.js` for 3 new operations.
2. Update `buildUnpaperOperationArgs()` for new `page_cleanup.manual` fields.
3. Preserve PGM conversion bridge for `unpaper`.
4. Keep timeout/cancel/error mapping behavior unchanged.

### Batch C - Renderer/UI

1. Update `public/js/import_ocr_ui_shared.js`:
   1. operation order,
   2. manual rules,
   3. defaults.
2. Update modal control wiring in `public/js/import_ocr_ui_options_modal.js`.
3. Add labels/help text in EN/ES for new operations + fields.
4. Preserve all-operations-off default per run.

### Batch D - Evidence + Gates

1. Update `docs/_evidence/issue_139_evidence.md` with command/probe entries.
2. Re-run Operation Compatibility Gate for all operations and modes.
3. Re-run smoke flow from `docs/issues/Issue_139_Smoke_Quality_Gate_Verification_Guide.md`.
4. Re-run mandatory quality gate on photographed/scanned/noisy families.
5. Record per-file CER tables and family pass/fail decisions.

## Compatibility/Safety Exclusion List (Keep Excluded)

Keep excluded with explicit reasons:

1. `--clean`: unsupported by shipped `unpaper.exe` (runtime incompatibility).
2. `--split`: unsupported by shipped `unpaper.exe` (runtime incompatibility + multi-output semantics).
3. `--input-pages 2`, `--output-pages 2`, sequence placeholders: break single-file adapter contract.
4. `--test-only`: no output artifact, incompatible with pipeline contract.
5. Free-form CLI passthrough: breaks strict schema/safety guarantees.
6. Unbounded layout geometry controls: elevated risk of text loss without dedicated quality proof.
7. Full perspective/curl dewarp controls requiring manual control points: not suitable for current bounded safe contract.

## File Touch Plan

Primary code:

1. `electron/import_ocr/preprocess_pipeline.js`
2. `electron/import_ocr/preprocess_runtime.js`
3. `public/js/import_ocr_ui_shared.js`
4. `public/js/import_ocr_ui_options_modal.js`
5. `public/js/import_ocr_ui.js` (labels/help text wiring if needed)
6. `electron/import_ocr/ocr_pipeline.js` (only if normalization path needs wiring updates)

i18n/docs:

1. `i18n/en/renderer.json`
2. `i18n/es/renderer.json`
3. `docs/_evidence/issue_139_evidence.md`
4. `docs/issues/Issue_139.md` (scoped-lock update if this expansion is accepted)

## Acceptance Criteria

Functional:

1. New operations execute in image and scanned-PDF OCR paths.
2. New manual params are enforced end-to-end with strict bounds.
3. `page_cleanup` manual direct knobs execute and are reflected in operation stats.

Policy:

1. No free-form CLI passthrough introduced.
2. Unsupported/multi-file/no-output `unpaper` features remain excluded.
3. Error mapping semantics remain unchanged.

Quality:

1. At least one non-off configuration per challenging family meets Issue 139 gate thresholds (`M`, `S`) on difficult subsets.
2. Evidence captures baseline vs non-off CER deltas for reproducibility.

## Execution Sequence

1. Approve this plan and freeze schema bounds/defaults.
2. Implement Batch A + B.
3. Implement Batch C.
4. Run lint + syntax checks.
5. Execute Operation Compatibility Gate.
6. Execute smoke + quality gate and record evidence.
7. Decide keep/tune/revert per-operation defaults based on measured CER outcomes.

