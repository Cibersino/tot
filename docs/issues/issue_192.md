# Issue Proposal: expand import/extract supported source-format matrix

## Objective

Expand the import, extraction, and OCR feature to support additional **static document/image source formats** without weakening the current route-selection contract or confusing the user about what is actually supported.

This proposal is intentionally limited to formats that fit the current import/extract architecture:

* native extraction formats that can reasonably yield plain text;
* OCR source formats that represent static page/image content;
* normalization work required to make those static formats usable by the existing OCR provider flow.

## Why this issue is worth opening

The current feature is organized around a clear central supported-format contract in:

* `electron/import_extract_platform/import_extract_supported_formats.js`

That contract currently allows:

* native extraction: `txt`, `md`, `html`, `htm`, `docx`, `pdf`
* OCR sources: `jpg`, `jpeg`, `png`, `webp`, `bmp`, `pdf`

This is a strong design baseline, but it leaves out several common static source formats that users may reasonably expect to import:

* text-like documents such as `rtf` and `odt`
* scanned image formats such as `tif` / `tiff`

The issue should therefore focus on expanding the **real supported-format matrix**, not just the picker filter.

## Scope

### In scope

* Evaluate and add support for additional static source formats that fit the current route model.
* Keep the shared format contract as the single source of truth for picker, prepare, and execution routing.
* Add any required parser or normalization work for new formats.
* Preserve the current route-selection behavior for PDFs and other supported source types.
* Update tests, sample files, and user-visible supported-format coverage accordingly.

### Proposed first-pass candidates

* Native extraction candidates:
  * `rtf`
  * `odt`
* OCR source candidates:
  * `tif`
  * `tiff`

### Explicitly out of scope

* Spreadsheet formats:
  * `csv`
  * `tsv`
  * `xls`
  * `xlsx`
  * `ods`
* Animated image extensions or animation-focused support:
  * `gif`
  * animated-image-specific expansion in general
* General media extraction:
  * audio
  * video
* Broad “open anything” behavior in the picker without matching parser/route support.
* Reworking the OCR provider or replacing the current Google Drive/Docs OCR flow.

## Current implementation constraints

The current implementation is intentionally extension-gated in several layers:

* shared format contract:
  * `electron/import_extract_platform/import_extract_supported_formats.js`
* picker filter:
  * `electron/import_extract_platform/import_extract_file_picker_ipc.js`
* prepare-time route classification:
  * `electron/import_extract_platform/import_extract_prepare_execute_core.js`
* native parsing:
  * `electron/import_extract_platform/native_extraction_route.js`
* OCR source gating:
  * `electron/import_extract_platform/ocr_google_drive_route.js`
* OCR preprocessing:
  * `electron/import_extract_platform/ocr_image_normalization.js`

That means support for a new extension is not complete unless all relevant layers are aligned.

## Design requirements

### 1. Keep one authoritative format contract

Do not add picker-only formats.

Any newly supported extension must be represented in the shared format contract and then flow consistently into:

* picker filtering
* prepare-time route availability
* execution-time route validation
* tests and sample fixtures

### 2. Preserve route honesty

The app must not imply that a file is supported unless the corresponding native or OCR route can actually run.

Examples:

* if a new text-document extension is native-only, it must not appear as OCR-capable unless OCR support is real;
* if a new image format requires normalization before OCR upload, that normalization must be explicit and tested;
* unsupported formats must continue to fail with the existing structured unsupported-format path instead of generic runtime errors.

### 3. Prefer bounded first-pass additions

The first implementation pass should favor formats that are likely to fit the current product shape:

* `rtf`
* `odt`
* `tif`
* `tiff`

Avoid mixing low-risk static formats with broader classes that would enlarge the product surface too much in one issue.

### 4. Exclude spreadsheet semantics

Spreadsheet files are a different product problem from text extraction.

Even if some spreadsheet formats can be converted to text mechanically, that should be tracked separately because it introduces different expectations around:

* sheet selection
* table preservation
* formula/result semantics
* structured-data loss

### 5. Exclude animated-image semantics

Animated image support would require product decisions that do not fit this issue:

* which frame to extract
* whether to flatten or reject animated sources
* how to communicate that behavior to the user

This proposal therefore excludes animated image extensions and any broader animation-handling expansion.

## Acceptance criteria

* A written target matrix exists for newly supported source formats before implementation is claimed complete.
* Each accepted new extension is wired through the shared format contract, not only the picker.
* Unsupported spreadsheet and animated-image extensions remain out of scope and are not added implicitly.
* Native candidates either:
  * extract usable text successfully, or
  * are rejected with a clear structured unsupported/runtime path during development until fully supported.
* OCR image candidates either:
  * upload successfully through the existing OCR pipeline, or
  * receive the required normalization layer plus regression coverage.
* The test suite and sample-file set are updated to reflect the actual supported extensions.
* User-facing behavior remains honest:
  * no false-positive picker support
  * no route-choice regressions
  * no generic-error fallback for known unsupported formats

## Risks / constraints

* Some candidate extensions may require new third-party dependencies or native/runtime handling.
* OCR provider behavior may differ by image format even if the local extension mapping looks simple.
* Some formats may parse partially or degrade formatting heavily; that may still be acceptable if the product goal is plain-text extraction, but it must be explicit.
* `webp` already exists as an OCR extension; this issue should not silently broaden that into animation support.
* Expanding support without updating sample fixtures and regression tests would make the feature contract drift out of sync.

## Recommended implementation order

1. Define the target extension matrix and confirm which candidates are accepted for this issue.
2. Add or adjust the shared supported-format contract.
3. Implement native parser support and/or OCR normalization support per accepted format.
4. Keep picker filtering derived from the shared contract.
5. Add sample files for each newly supported format.
6. Extend regression coverage for picker, prepare, route selection, and execution.
7. Verify unsupported spreadsheet and animated-image extensions still fail cleanly.

## Breakdown

- [ ] Confirm the first-pass target matrix for static document/image formats
- [ ] Decide whether `rtf` support is in scope for this issue
- [ ] Decide whether `odt` support is in scope for this issue
- [ ] Decide whether `tif` / `tiff` OCR support is in scope for this issue
- [ ] Update `electron/import_extract_platform/import_extract_supported_formats.js`
- [ ] Implement any required native parser additions
- [ ] Implement any required OCR normalization additions
- [ ] Verify `electron/import_extract_platform/import_extract_file_picker_ipc.js` stays aligned automatically with the format contract
- [ ] Extend prepare/execute regression coverage for each accepted extension
- [ ] Add/update sample files referenced by `docs/test_suite.md`
- [ ] Keep spreadsheet extensions explicitly unsupported in this issue
- [ ] Keep animated image extensions explicitly unsupported in this issue

