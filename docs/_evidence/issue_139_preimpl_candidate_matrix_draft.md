# Issue 139 - Pre-Implementation Decision Gate

## Strict Criteria 1-6 Scoring Matrix Draft (Discovery Only, Unfrozen)

Timestamp:
- 2026-03-05 18:43:31 -03:00

Status:
- This is a draft scoring artifact only.
- Candidate list is not frozen.
- No candidate selection is made here.
- No implementation proof is attempted here.
- No criteria 1-6 table is used (readability requirement).

Primary issue anchors:
- `docs/issues/Issue_139.md:135` (define bundled/custom lists before testing)
- `docs/issues/Issue_139.md:140` (criteria 1-6 definitions)
- `docs/issues/Issue_139.md:149` (pass condition: criteria 1-5)
- `docs/issues/Issue_139.md:154` (criterion 6 mandatory input, non-hard-gate)
- `docs/issues/Issue_139.md:26` (custom `.exe` only after capability-gap proof)

Repository constraint anchors used for every candidate:
- `electron/import_ocr/platform/profile_registry.js:19` (sidecar-per-target model)
- `electron/import_ocr/platform/resolve_sidecar.js:96` (env/resource/app path resolution; no PATH discovery model)
- `ocr/README.md:24` (sidecars launched from packaged target folders; no PATH lookup)
- `electron/import_ocr/platform/process_control.js:57` (Windows process tree termination via `taskkill`)
- `electron/import_ocr/ocr_runtime.js:205` (timeout/cancel capable subprocess wrapper)
- `public/js/import_ocr_ui_shared.js:31` (legacy preprocess profile still present; migration still pending)

Evidence commands executed in this discovery pass:
- `Get-Content docs/issues/Issue_139.md`
- `rg -n "preprocess|OCR_PREPROCESS|OCR_BINARY_MISSING|preprocessing" ...`
- `Get-Content electron/import_ocr/platform/resolve_sidecar.js`
- `Get-Content electron/import_ocr/platform/process_control.js`
- `Get-Content electron/import_ocr/ocr_runtime.js`
- `Get-Content electron/import_ocr/platform/profile_registry.js`
- `Get-Content ocr/README.md`

---

## Scoring Rules (Strict Draft)

Score scale for each criterion:
- `0.0`: not realizable under current issue constraints.
- `1.0`: major blockers; currently impractical.
- `2.0`: significant unresolved gaps; likely fails gate.
- `3.0`: plausible but with material risk/unknowns.
- `4.0`: strong fit with manageable risk.
- `5.0`: very strong fit with direct evidence and low integration risk.

Criteria (Issue_139 exact intent):
- `C1` Contract realizability (`off|auto|manual`, bounded manual params, scoped-lock key/order).
- `C2` Runtime-policy realizability (timeout/cancel/fail-fast/cleanup semantics).
- `C3` Observability realizability (structured stats + deterministic typed mapping).
- `C4` Cross-platform-ready architecture (future targets ready without shipping now).
- `C5` Compliance viability (licensing/compliance for current and planned targets).
- `C6` Quality potential signal (mandatory input, non-hard-gate).

Draft gate classification (strict interpretation for this draft):
- `PASS_STRICT`: all `C1..C5 >= 4.0`.
- `HOLD`: all `C1..C5 >= 3.0`, but at least one of `C1..C5` is `< 4.0`.
- `FAIL`: any of `C1..C5 < 3.0`.

Policy overlay:
- Any custom runner candidate (`C*`) remains `GAP_ONLY` until capability-gap evidence proves bundled paths cannot satisfy the gate (`docs/issues/Issue_139.md:26`).

---

## Bundled Candidates

### B01 - ImageMagick CLI (`magick`)
- `C1`: `4.5`
- `C2`: `4.0`
- `C3`: `4.0`
- `C4`: `4.5`
- `C5`: `4.5`
- `C6`: `4.5`
- Gate status: `PASS_STRICT`
- Confidence: `High`
- Notes: broad operation surface maps cleanly to wrapper orchestration; strong fit to existing sidecar process pattern.
- Evidence links:
  - https://imagemagick.org/script/command-line-options.php
  - https://imagemagick.org/script/security-policy.php
  - https://imagemagick.org/license/
  - https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html

### B02 - GraphicsMagick CLI (`gm`)
- `C1`: `3.5`
- `C2`: `4.0`
- `C3`: `3.5`
- `C4`: `4.0`
- `C5`: `4.5`
- `C6`: `3.5`
- Gate status: `HOLD`
- Confidence: `Medium`
- Notes: mature CLI path and permissive license; operation parity versus scoped-lock needs requires targeted probing.
- Evidence links:
  - https://www.graphicsmagick.org/
  - https://www.graphicsmagick.org/GraphicsMagick.html
  - https://graphicsmagick.sourceforge.io/Copyright.html

### B03 - libvips CLI (`vips`)
- `C1`: `3.5`
- `C2`: `4.0`
- `C3`: `4.0`
- `C4`: `4.5`
- `C5`: `3.0`
- `C6`: `3.5`
- Gate status: `HOLD`
- Confidence: `Medium`
- Notes: strong performance and broad ops, but compliance/packaging review is stricter because of LGPL and dependency chain.
- Evidence links:
  - https://www.libvips.org/
  - https://www.libvips.org/install
  - https://www.libvips.org/API/current/using-the-cli.html
  - https://github.com/libvips/libvips

### B04 - unpaper CLI
- `C1`: `3.0`
- `C2`: `3.5`
- `C3`: `3.0`
- `C4`: `4.0`
- `C5`: `2.0`
- `C6`: `4.0`
- Gate status: `FAIL` (`C5 < 3.0`)
- Confidence: `High`
- Notes: strong OCR-focused processing potential, but license/compliance posture is a major blocker in current draft.
- Evidence links:
  - https://github.com/unpaper/unpaper
  - https://manpages.ubuntu.com/manpages/lunar/man1/unpaper.1.html
  - https://ocrmypdf.readthedocs.io/en/v16.0.1/advanced.html

### B05 - G'MIC CLI (`gmic`)
- `C1`: `4.0`
- `C2`: `3.5`
- `C3`: `3.0`
- `C4`: `4.0`
- `C5`: `2.5`
- `C6`: `3.5`
- Gate status: `FAIL` (`C5 < 3.0`)
- Confidence: `Medium`
- Notes: very broad filter language; stronger compliance and stability scrutiny needed for selected command subset.
- Evidence links:
  - https://gmic.eu/
  - https://gmic.eu/reference/list_of_commands.html
  - https://github.com/GreycLab/gmic

### B06 - NAPS2 Console (`naps2.console`)
- `C1`: `2.5`
- `C2`: `3.0`
- `C3`: `2.0`
- `C4`: `3.5`
- `C5`: `2.0`
- `C6`: `3.0`
- Gate status: `FAIL` (`C1`, `C3`, `C5 < 3.0`)
- Confidence: `High`
- Notes: good operational tooling, but weak fit to strict operation-by-operation adapter/observability contract; GPL app license is a major compliance concern for bundling this path as core preprocess engine.
- Evidence links:
  - https://www.naps2.com/doc/command-line
  - https://github.com/cyanfish/naps2
  - https://www.naps2.com/download

### B07 - ScanTailor Advanced runtime path
- `C1`: `1.0`
- `C2`: `1.5`
- `C3`: `1.0`
- `C4`: `2.5`
- `C5`: `2.0`
- `C6`: `3.0`
- Gate status: `FAIL`
- Confidence: `Medium`
- Notes: high-quality page processing reputation, but runtime automation and deterministic contract realization are weak for this gate.
- Evidence links:
  - https://github.com/4lex4/scantailor-advanced

### B08 - Tesseract-internal-only preprocessing path
- `C1`: `2.5`
- `C2`: `4.5`
- `C3`: `2.5`
- `C4`: `5.0`
- `C5`: `5.0`
- `C6`: `2.5`
- Gate status: `FAIL` (`C1`, `C3 < 3.0`)
- Confidence: `Medium`
- Notes: very low packaging risk but likely insufficient operation surface for scoped-lock contract ambition.
- Evidence links:
  - https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html

### B09 - OCRmyPDF as preprocess runtime
- `C1`: `1.5`
- `C2`: `2.5`
- `C3`: `2.0`
- `C4`: `3.0`
- `C5`: `2.5`
- `C6`: `4.0`
- Gate status: `FAIL`
- Confidence: `High`
- Notes: useful comparator/reference, but architecture is a full OCR pipeline tool, not a clean preprocess adapter fit for this issue.
- Evidence links:
  - https://github.com/ocrmypdf/OCRmyPDF
  - https://ocrmypdf.readthedocs.io/en/v16.0.1/advanced.html
  - https://docs.paperless-ngx.com/configuration/

---

## Hybrid Bundled Candidates

### H01 - ImageMagick -> unpaper chain
- `C1`: `4.5`
- `C2`: `3.5`
- `C3`: `3.5`
- `C4`: `4.5`
- `C5`: `2.0`
- `C6`: `5.0`
- Gate status: `FAIL` (`C5 < 3.0`)
- Confidence: `High`
- Notes: strongest quality-potential hypothesis among bundled chains, but compliance burden from unpaper blocks strict pass.
- Evidence links:
  - https://imagemagick.org/script/command-line-options.php
  - https://github.com/unpaper/unpaper
  - https://ocrmypdf.readthedocs.io/en/v16.0.1/advanced.html

### H02 - libvips -> unpaper chain
- `C1`: `4.0`
- `C2`: `3.5`
- `C3`: `3.5`
- `C4`: `4.5`
- `C5`: `2.0`
- `C6`: `4.5`
- Gate status: `FAIL` (`C5 < 3.0`)
- Confidence: `Medium`
- Notes: strong potential for speed plus OCR cleanup; same compliance blocker pattern as H01.
- Evidence links:
  - https://www.libvips.org/
  - https://github.com/unpaper/unpaper

### H03 - GraphicsMagick -> unpaper chain
- `C1`: `4.0`
- `C2`: `3.5`
- `C3`: `3.5`
- `C4`: `4.5`
- `C5`: `2.0`
- `C6`: `4.0`
- Gate status: `FAIL` (`C5 < 3.0`)
- Confidence: `Medium`
- Notes: valid chain conceptually; same copyleft/compliance blocker from unpaper.
- Evidence links:
  - https://www.graphicsmagick.org/
  - https://github.com/unpaper/unpaper

### H04 - G'MIC -> unpaper chain
- `C1`: `4.0`
- `C2`: `3.0`
- `C3`: `3.0`
- `C4`: `4.0`
- `C5`: `1.5`
- `C6`: `4.0`
- Gate status: `FAIL`
- Confidence: `Low`
- Notes: high flexibility, but highest complexity/compliance uncertainty among hybrids in this draft.
- Evidence links:
  - https://gmic.eu/
  - https://github.com/GreycLab/gmic
  - https://github.com/unpaper/unpaper

---

## Custom Candidates (Policy: GAP_ONLY until capability-gap is proven)

### C01 - Custom OpenCV preprocess runner (`.exe`)
- `C1`: `5.0`
- `C2`: `4.0`
- `C3`: `5.0`
- `C4`: `4.0`
- `C5`: `4.5`
- `C6`: `4.5`
- Gate status: `PASS_STRICT`
- Policy state: `GAP_ONLY` (cannot be selected unless bundled capability-gap is proven)
- Confidence: `High`
- Notes: strongest control over contract/observability; higher build/distribution burden.
- Evidence links:
  - https://docs.opencv.org/4.x/d7/d4d/tutorial_py_thresholding.html
  - https://docs.opencv.org/4.x/d9/d61/tutorial_py_morphological_ops.html
  - https://opencv.org/license/

### C02 - Custom Leptonica preprocess runner (`.exe`)
- `C1`: `4.5`
- `C2`: `4.0`
- `C3`: `5.0`
- `C4`: `4.0`
- `C5`: `4.5`
- `C6`: `4.5`
- Gate status: `PASS_STRICT`
- Policy state: `GAP_ONLY`
- Confidence: `Medium`
- Notes: strong document-image operation fit; custom integration/testing work remains substantial.
- Evidence links:
  - https://www.leptonica.org/
  - https://github.com/DanBloomberg/leptonica
  - https://www.leptonica.org/download.html

### C03 - Custom libvips preprocess runner (`.exe`)
- `C1`: `4.5`
- `C2`: `4.0`
- `C3`: `5.0`
- `C4`: `4.5`
- `C5`: `3.0`
- `C6`: `4.0`
- Gate status: `HOLD`
- Policy state: `GAP_ONLY`
- Confidence: `Medium`
- Notes: strong technical path, with compliance packaging review as main drag.
- Evidence links:
  - https://www.libvips.org/
  - https://github.com/libvips/libvips

### C04 - Custom .NET preprocess runner (e.g., NAPS2 images stack or equivalent)
- `C1`: `4.0`
- `C2`: `3.5`
- `C3`: `5.0`
- `C4`: `4.0`
- `C5`: `2.5`
- `C6`: `3.5`
- Gate status: `FAIL` (`C5 < 3.0`)
- Policy state: `GAP_ONLY`
- Confidence: `Medium`
- Notes: can satisfy contract/observability well, but licensing/package composition needs stricter clarification.
- Evidence links:
  - https://www.naps2.com/sdk/doc/api/
  - https://github.com/cyanfish/naps2

### C05 - In-process Node adapter via `sharp` (libvips-backed)
- `C1`: `4.0`
- `C2`: `2.5`
- `C3`: `4.0`
- `C4`: `4.0`
- `C5`: `3.0`
- `C6`: `3.5`
- Gate status: `FAIL` (`C2 < 3.0`)
- Policy state: `GAP_ONLY`
- Confidence: `Medium`
- Notes: technically capable image operations, but diverges from current subprocess sidecar policy and timeout/cancel model.
- Evidence links:
  - https://github.com/lovell/sharp
  - https://sharp.pixelplumbing.com/
  - https://www.libvips.org/

### C06 - Python sidecar (`opencv`/`scikit-image` family)
- `C1`: `5.0`
- `C2`: `2.5`
- `C3`: `5.0`
- `C4`: `3.5`
- `C5`: `3.0`
- `C6`: `4.0`
- Gate status: `FAIL` (`C2 < 3.0`)
- Policy state: `GAP_ONLY`
- Confidence: `Medium`
- Notes: maximum algorithm flexibility; weakest runtime and packaging fit with current app model.
- Evidence links:
  - https://docs.opencv.org/4.x/
  - https://opencv.org/license/

---

## Draft Readout (No Freeze)

Observed `PASS_STRICT` in this draft:
- `B01`
- `C01` (`GAP_ONLY`)
- `C02` (`GAP_ONLY`)

Observed `HOLD` in this draft:
- `B02`
- `B03`
- `C03` (`GAP_ONLY`)

Observed `FAIL` in this draft:
- `B04`, `B05`, `B06`, `B07`, `B08`, `B09`
- `H01`, `H02`, `H03`, `H04`
- `C04`, `C05`, `C06`

Important interpretation constraints:
- This draft is intentionally strict and conservative.
- `C*` entries are not selection candidates unless bundled capability-gap is proven per issue policy.
- `C6` is mandatory decision input but does not override `C1..C5` gate failures.

Open evidence gaps before any freeze:
- Verify exact scoped-lock operation set and order (currently not frozen in this draft).
- Run lightweight probe scripts for `B02` and `B03` to reduce `C1/C3` uncertainty.
- Complete legal/compliance review packet for any candidate with non-permissive or mixed dependency licensing.

