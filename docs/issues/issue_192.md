# Issue Proposal: expand import/extract supported source-format matrix

## Objective

Evaluate and define support for additional **static document/image source formats** in the import, extraction, and OCR feature.

## Why this issue is worth opening

The current feature already has an explicit supported-format boundary in:

* `electron/import_extract_platform/import_extract_supported_formats.js`

That boundary currently includes:

* native extraction: `txt`, `md`, `html`, `htm`, `docx`, `pdf`
* OCR sources: `jpg`, `jpeg`, `png`, `webp`, `bmp`, `pdf`

The issue exists because support questions about additional extensions should be answered deliberately, not by ad hoc picker expansion or implicit assumptions about what "should probably work."

The current supported set excludes several static formats that are reasonable candidates for evaluation, including:

* document formats such as `rtf`, `odt`, and legacy Word `.doc`
* image formats such as `tif` / `tiff`

The issue should therefore determine, for each candidate extension:

* whether it should be supported at all
* what implementation path would be required
* what testing and maintenance burden that decision would create

## Scope

### In scope

* Evaluate candidate static source formats and decide whether each one should be supported.
* Keep the shared format contract as the single source of truth for picker, prepare, and execution routing.
* Add any required parser or normalization work for new formats.
* Preserve correct behavior for already supported source types.
* Update tests, sample files, and user-visible supported-format coverage accordingly.

### Evaluation set for this issue

The initial evaluation set for this issue is:

* `rtf`
* `odt`
* legacy Word `.doc`
* `tif`
* `tiff`

These entries are **candidates for evaluation**, not pre-approved implementation targets.

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

The current implementation makes support decisions through explicit extension and capability gates. For this issue, that matters for one reason: adding an extension is not complete unless every relevant layer agrees on the same decision.

The main layers involved are:

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

Therefore, this issue must treat “support” as a whole-feature decision, not as a single-file or picker-only change.

## Design requirements

### 1. Keep one authoritative format contract

Do not add picker-only formats.

Any newly supported extension must be represented in the shared format contract and then flow consistently into:

* picker filtering
* prepare-time route availability
* execution-time route validation
* tests and sample fixtures

### 2. Preserve support honesty

The app must not imply that a file is supported unless there is a real implementation path that can execute successfully and fail coherently.

Examples:

* if a candidate format requires local normalization before upload, that normalization must be explicit and tested;
* if a candidate format would only work through a cloud-backed conversion path, that must be evaluated explicitly rather than assumed;
* unsupported formats must continue to fail with the existing structured unsupported-format path instead of generic runtime errors.

### 3. Prefer bounded first-pass additions

Do not finalize the first implementation pass by intuition alone.

Before any candidate extension is accepted into the implementation scope for this issue, record an evidence-based decision against the current architecture and delivery constraints.

Each candidate in the evaluation set should be assessed on:

* current repo behavior:
  * how the format is classified or rejected today
* possible implementation paths:
  * one path, multiple paths, or no credible path
* existing repo support:
  * whether a parser/conversion path already exists in the codebase or dependencies
* dependency/runtime cost:
  * whether the format requires a new library, external converter, or provider-specific handling
* packaging/legal impact:
  * whether supporting the format introduces new packaged/runtime or license obligations
* failure-model fit:
  * whether corrupt, unreadable, unsupported, or partial-support cases can map cleanly into the current structured error contract
* test burden:
  * sample files
  * regression coverage
  * user-visible supported-format documentation

The issue should then record one explicit outcome per candidate:

* include in this issue
* defer from this issue
* reject for this issue

### 3.1 Decision table required

Before implementation begins, add a short decision table for:

* `rtf`
* `odt`
* `.doc`
* `tif`
* `tiff`

Each row should capture:

* current behavior
* possible paths
* repo evidence
* external evidence
* dependency impact
* testing impact
* final decision

## Evaluation table

| Candidate | Current behavior | Possible paths | Repo evidence | External evidence | Dependency impact | Testing impact | Final decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `rtf` | Rejected today because it is not present in the shared supported-format contract. | 1. Route through the existing Drive upload-convert-export path. 2. Add a native parser path. | The current Drive-backed path uploads a file with a caller-supplied MIME type, creates a Google Doc, then exports `text/plain`. The current gates block `rtf` before that path is reached. The repo has no native `rtf` parser today. | Google Drive documents the following common import formats to Google Docs: Microsoft Word, OpenDocument Text, HTML, RTF, plain text. It also states that supported conversions should be checked through `about.importFormats`. | No new dependency is required if the Drive conversion path is used. A native path would require a new parser dependency. | Needs at least one `rtf` fixture, negative-path coverage, and support-matrix updates in docs/tests. | **Include in this issue.** Preferred path: use the existing Drive conversion pipeline, not a new native parser. |
| `odt` | Rejected today because it is not present in the shared supported-format contract. | 1. Route through the existing Drive upload-convert-export path. 2. Add a native parser path. | The repo has no native `odt` parser today. The current Drive-backed path is technically compatible with format conversion, but `odt` is blocked by the current gates before execution. | Google Drive documents OpenDocument Text as a common import format to Google Docs and states that supported conversions should be checked through `about.importFormats`. | No new dependency is required if the Drive conversion path is used. A native path would require a new parser dependency. | Needs at least one `odt` fixture, negative-path coverage, and support-matrix updates in docs/tests. | **Include in this issue.** Preferred path: use the existing Drive conversion pipeline, not a new native parser. |
| `.doc` | Rejected today because it is not present in the shared supported-format contract. | 1. Route through the existing Drive upload-convert-export path if legacy Word is confirmed for the exact MIME used by this app. 2. Add a native legacy-Word parser path. | The repo has no native legacy Word parser today. The current Drive-backed path could be used if the relevant legacy MIME is confirmed through the documented conversion mechanism. | Google Drive documents Microsoft Word as a common import format to Google Docs and says supported conversions should be checked through `about.importFormats`. The sources used in this pass do not explicitly distinguish legacy `.doc` from `.docx`. | No new dependency is required if the Drive conversion path is valid for legacy `.doc`. A native path would require a new parser dependency. | Needs at least one `.doc` fixture plus an explicit verification step for the exact conversion path before implementation is claimed safe. | **Defer from this issue.** Reason: legacy `.doc` support is plausible, but not established precisely enough by the evidence gathered here. |
| `tif` | Rejected today because it is not present in the shared supported-format contract. | 1. Normalize locally to PNG, then use the existing Drive image/OCR path. 2. Use direct Drive conversion only if TIFF support is verified explicitly. | The repo already has an OCR image-normalization layer and already ships `sharp`. That layer currently converts `webp` to PNG before upload. The current Drive-backed path already handles supported image uploads plus `ocrLanguage`. | Google Drive documents JPEG, PNG, GIF, BMP, and PDF as common image/PDF imports to Google Docs. TIFF is not listed there. Sharp documents TIFF input support and PNG output support. | No new dependency is required for a local TIFF-to-PNG normalization path because `sharp` is already present. | Needs `.tif` fixture coverage for normalization success/failure, prepare-time gating, and end-to-end extraction. | **Include in this issue.** Preferred path: local normalization to PNG, then existing Drive-backed extraction. |
| `tiff` | Rejected today because it is not present in the shared supported-format contract. | 1. Normalize locally to PNG, then use the existing Drive image/OCR path. 2. Use direct Drive conversion only if TIFF support is verified explicitly. | Same repo evidence as `tif`: existing normalization layer plus existing `sharp` dependency. | Same external evidence as `tif`: TIFF is not listed in the Drive common import formats used here, while Sharp documents TIFF input support and PNG output support. | No new dependency is required for a local TIFF-to-PNG normalization path because `sharp` is already present. | Needs `.tiff` fixture coverage for normalization success/failure, prepare-time gating, and end-to-end extraction. | **Include in this issue.** Preferred path: local normalization to PNG, then existing Drive-backed extraction. |

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

* A written evaluation table exists for `rtf`, `odt`, `.doc`, `tif`, and `tiff` before implementation scope is claimed final.
* The issue records a concrete decision for each evaluated candidate:
  * include in this issue
  * defer from this issue
  * reject for this issue
* The issue records the basis for each decision:
  * current behavior
  * possible paths
  * repo evidence
  * external evidence
  * dependency impact
  * testing impact
* Each accepted new extension is wired through the shared format contract, not only the picker.
* Unsupported spreadsheet and animated-image extensions remain out of scope and are not added implicitly.
* Each included candidate has at least one implementation path that is explicit, justified, and testable.
* The test suite and sample-file set are updated to reflect the actual supported extensions.
* The user-visible supported set matches the actual implementation:
  * no false-positive picker support
  * no generic-error fallback for known unsupported formats

## Risks / constraints

* Some candidate extensions may require new third-party dependencies or native/runtime handling.
* OCR provider behavior may differ by image format even if the local extension mapping looks simple.
* Some formats may parse partially or degrade formatting heavily; that may still be acceptable if the product goal is plain-text extraction, but it must be explicit.
* `webp` already exists as an OCR extension; this issue should not silently broaden that into animation support.
* Expanding support without updating sample fixtures and regression tests would make the feature contract drift out of sync.

## Recommended implementation order

1. Record the evaluation outcomes for `rtf`, `odt`, `.doc`, `tif`, and `tiff` in this issue.
2. Update the shared supported-format contract for the included candidates: `rtf`, `odt`, `tif`, `tiff`.
3. Extend the current Drive-backed extraction path to cover `rtf` and `odt`.
4. Extend local normalization to cover `tif` and `tiff` before upload.
5. Keep picker filtering derived from the shared contract.
6. Add sample files for each included extension.
7. Extend regression coverage for picker, prepare, normalization, and execution.
8. Verify `.doc` remains deferred and unsupported in this issue.
9. Verify unsupported spreadsheet and animated-image extensions still fail cleanly.

## Breakdown

- [x] Add an evaluation table covering `rtf`, `odt`, `.doc`, `tif`, and `tiff`
- [x] Record a decision for `rtf`
- [x] Record a decision for `odt`
- [x] Record a decision for legacy Word `.doc`
- [x] Record a decision for `tif`
- [x] Record a decision for `tiff`
- [x] Record the basis for each decision:
  * current behavior
  * possible paths
  * repo evidence
  * external evidence
  * dependency impact
  * testing impact
- [ ] Update `electron/import_extract_platform/import_extract_supported_formats.js` for `rtf`, `odt`, `tif`, and `tiff`
- [ ] Extend the current Drive-backed extraction path for `rtf` and `odt`
- [ ] Extend local normalization for `tif` and `tiff`
- [ ] Verify `electron/import_extract_platform/import_extract_file_picker_ipc.js` stays aligned automatically with the format contract
- [ ] Extend prepare/execute regression coverage for `rtf`, `odt`, `tif`, and `tiff`
- [ ] Add/update sample files referenced by `docs/test_suite.md` for `rtf`, `odt`, `tif`, and `tiff`
- [ ] Keep legacy Word `.doc` deferred in this issue
- [ ] Keep spreadsheet extensions explicitly unsupported in this issue
- [ ] Keep animated image extensions explicitly unsupported in this issue
