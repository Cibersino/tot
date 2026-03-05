# Issue 139 - Pre-Implementation Decision Gate

## Criteria 1-6 Matrix Draft (Rigor Rebuild, Discovery Only, Unfrozen)

Timestamp:
- 2026-03-05 19:33:49 -03:00

Status:
- Discovery only.
- List is not frozen.
- No candidate selected.
- No implementation proof.
- Existing file updated (no new matrix file).

---

## Investigation Protocol (Applied in This Pass)

What changed for rigor:
- Every scored candidate must be backed by sources opened and inspected in this session.
- Claims with weak or unstable source access are marked `partial` and scored conservatively.
- Priority ordering is explicit and controls readout:
  - primary: expected extraction improvement and reliability (`Primary`)
  - secondary: per-operation fidelity/control (`Secondary`)
  - then: delivery/policy/compliance/maintenance (`Other`)

Scoring scales:
- `Primary`, `Secondary`, `Other`: `0.0` to `5.0`.
- Criteria `C1..C6`: `0.0` to `5.0`.

Criteria mapping (Issue_139):
- `C1`: contract realizability (`off|auto|manual`, bounded manual schema).
- `C2`: runtime-policy realizability (timeout/cancel/fail-fast/cleanup).
- `C3`: observability realizability (structured stats + typed mapping).
- `C4`: cross-platform-ready architecture.
- `C5`: compliance viability.
- `C6`: quality potential signal.

Important:
- This is technical/product analysis, not legal advice.
- `C5` is a risk signal pending legal/compliance review.

Assumption applied for this revision:
- `A1`: The project already runs a strong third-party compliance process in production (license notices, provenance tracking, release discipline). Under `A1`, `unpaper`-path `C5` is treated as managed risk, not default blocker.

---

## Repository Constraints (Current App State)

Anchors used to avoid unrealistic candidates:
- `electron/import_ocr/platform/profile_registry.js:19` (sidecar-by-target model under `ocr/<platform>-<arch>`).
- `electron/import_ocr/platform/resolve_sidecar.js:96` and `ocr/README.md:7` (runtime resolution uses explicit/env/resources/app path, not PATH discovery).
- `electron/import_ocr/ocr_pipeline.js:87` and `ocr/README.md:28` (`OCR_BINARY_MISSING` policy already central).
- `electron/import_ocr/platform/process_control.js:57` and `electron/import_ocr/ocr_runtime.js:255` (timeout/cancel + forced terminate available).
- `public/js/import_ocr_ui_shared.js:31` (legacy `basic|standard|aggressive` still present; migration pending).

---

## External Source Audit Ledger (This Session)

Verified:
- https://imagemagick.org/script/command-line-options.php
- https://imagemagick.org/script/security-policy.php
- https://imagemagick.org/license/
- https://graphicsmagick.sourceforge.io/ (license/release baseline)
- https://www.graphicsmagick.org/GraphicsMagick.html (partially unstable fetch; capability evidence treated as partial)
- https://www.libvips.org/
- https://www.libvips.org/API/current/using-the-cli.html
- https://www.libvips.org/install
- https://github.com/libvips/libvips
- https://github.com/unpaper/unpaper
- https://ocrmypdf.readthedocs.io/en/v16.0.1/advanced.html
- https://docs.paperless-ngx.com/configuration/
- https://github.com/GreycLab/gmic
- https://gmic.eu/reference/list_of_commands.html
- https://www.naps2.com/doc/command-line
- https://github.com/cyanfish/naps2
- https://github.com/4lex4/scantailor-advanced
- https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html
- https://github.com/ocrmypdf/OCRmyPDF
- https://opencv.org/license/
- https://docs.opencv.org/4.x/d7/d4d/tutorial_py_thresholding.html
- https://docs.opencv.org/4.x/d9/d61/tutorial_py_morphological_ops.html
- https://docs.opencv.org/4.x/df/d2d/group__ximgproc.html
- https://github.com/DanBloomberg/leptonica
- https://github.com/DanBloomberg/leptonica/blob/master/leptonica-license.txt
- https://github.com/lovell/sharp
- https://github.com/ocropus-archive/DUP-ocropy
- https://github.com/mittagessen/kraken

Partial / blocked in this pass:
- `unpaper` Ubuntu manpage URL intermittently inaccessible from tool.
- SourceForge OCRopus command wiki inaccessible from tool.
- GIMP batch docs inaccessible from tool.

---

## Expanded Candidate Investigation (Revised)

Format per candidate:
- `Priority`: `Primary | Secondary | Other`
- `Criteria`: `C1 | C2 | C3 | C4 | C5 | C6`
- `Evidence`: source set used in this pass

### Bundled Candidates

`B01` ImageMagick CLI
- Priority: `4.5 | 4.6 | 4.2`
- Criteria: `4.7 | 4.2 | 4.0 | 4.5 | 4.5 | 4.6`
- Notes: strong operation coverage (`deskew`, `auto-threshold`, `morphology`, `despeckle`, `normalize`) + explicit security-policy limit controls.
- Evidence: ImageMagick options/security/license, Tesseract ImproveQuality.

`B02` GraphicsMagick CLI
- Priority: `3.5 | 3.4 | 4.2`
- Criteria: `3.3 | 4.0 | 3.5 | 4.3 | 4.7 | 3.4`
- Notes: license/release posture is strong; command capability evidence is partially unstable due fetch issues, so fidelity is scored conservatively.
- Evidence: GraphicsMagick site/release/license snippets.

`B03` libvips CLI
- Priority: `3.9 | 3.8 | 3.6`
- Criteria: `3.8 | 3.6 | 3.8 | 4.4 | 3.0 | 3.9`
- Notes: very broad operations and low-memory profile; CLI chaining requires intermediate files (runtime complexity).
- Evidence: libvips main docs, CLI docs, install docs, GitHub.

`B04` unpaper CLI
- Priority: `4.2 | 3.3 | 3.5`
- Criteria: `3.4 | 3.2 | 3.0 | 3.8 | 3.8 | 4.4`
- Notes: strong OCR cleanup upside; with `A1`, compliance is treated as controlled operational work (still requires strict FFmpeg/unpaper provenance controls).
- Evidence: unpaper repo, OCRmyPDF unpaper notes, Paperless config signals.

`B05` G'MIC CLI
- Priority: `3.8 | 4.2 | 2.9`
- Criteria: `4.1 | 3.2 | 3.2 | 3.7 | 2.5 | 3.8`
- Notes: very deep filter surface (including denoise/morphology families), but complexity/compliance overhead is higher.
- Evidence: G'MIC repo + command reference.

`B06` NAPS2 Console
- Priority: `3.1 | 2.9 | 2.6`
- Criteria: `2.8 | 3.0 | 2.5 | 3.4 | 2.0 | 3.2`
- Notes: useful OCR command surface and component installer options, but weaker low-level preprocess adapter control and licensing complexity.
- Evidence: NAPS2 CLI docs + GitHub licensing split.

`B07` ScanTailor Advanced runtime path
- Priority: `2.9 | 2.0 | 2.1`
- Criteria: `1.9 | 2.6 | 2.0 | 2.4 | 2.0 | 3.0`
- Notes: strong interactive page-processing features, but project explicitly scopes out OCR and is interactive-first.
- Evidence: ScanTailor README/license.

`B08` Tesseract-internal-only preprocessing
- Priority: `2.9 | 2.6 | 4.7`
- Criteria: `2.6 | 4.6 | 2.7 | 5.0 | 5.0 | 2.9`
- Notes: excellent delivery fit, but likely insufficient control surface for Issue_139 operation contract and quality ambition.
- Evidence: Tesseract ImproveQuality + repo runtime constraints.

`B09` OCRmyPDF-as-runtime
- Priority: `3.4 | 2.1 | 2.4`
- Criteria: `2.0 | 2.6 | 2.7 | 3.0 | 3.2 | 3.7`
- Notes: strong OCR ecosystem tool, but it is a full OCR pipeline and PATH-oriented binary discovery model, not a tight preprocess sidecar adapter.
- Evidence: OCRmyPDF repo + advanced docs.

`B10` Leptonica utility path
- Priority: `4.1 | 3.8 | 4.0`
- Criteria: `3.7 | 4.0 | 3.7 | 4.2 | 4.6 | 4.1`
- Notes: document-image-native capabilities and permissive license terms; operational packaging specifics still need probing.
- Evidence: Leptonica repo + license file.

`B11` OCRopus CLI path
- Priority: `3.8 | 3.6 | 2.7`
- Criteria: `3.6 | 2.6 | 3.4 | 2.7 | 4.2 | 3.9`
- Notes: command-line modularity and document-analysis scope are real, but Python/runtime operational burden is significant.
- Evidence: OCRopus repo README/license.

`B12` Kraken CLI path
- Priority: `4.0 | 3.8 | 2.8`
- Criteria: `3.7 | 2.7 | 3.6 | 2.8 | 4.3 | 4.1`
- Notes: strong OCR capabilities for difficult scripts/documents; deployment model is Python/pip-centric and currently Linux/mac emphasized.
- Evidence: Kraken repo README/license/install notes.

### Hybrid Candidates

`H01` ImageMagick -> unpaper
- Priority: `4.7 | 4.8 | 3.5`
- Criteria: `4.8 | 3.4 | 3.6 | 4.2 | 3.8 | 4.8`
- Notes: top bundled-hybrid quality hypothesis; under `A1`, compliance burden is significant but manageable with disciplined release controls.
- Evidence: ImageMagick + unpaper + OCRmyPDF unpaper behavior.

`H02` libvips -> unpaper
- Priority: `4.4 | 4.3 | 3.4`
- Criteria: `4.3 | 3.1 | 3.4 | 4.0 | 3.7 | 4.6`
- Notes: quality upside plus performance; under `A1`, compliance is manageable and main risk shifts to orchestration/runtime complexity.
- Evidence: libvips + unpaper sources.

`H03` GraphicsMagick -> unpaper
- Priority: `4.2 | 4.1 | 3.5`
- Criteria: `4.0 | 3.2 | 3.3 | 4.1 | 3.8 | 4.4`
- Notes: comparable hypothesis to H01/H02 but with weaker verified evidence on fine-grained operation parity.
- Evidence: GraphicsMagick + unpaper sources.

`H04` G'MIC -> unpaper
- Priority: `4.1 | 4.4 | 3.1`
- Criteria: `4.3 | 2.8 | 3.1 | 3.6 | 3.4 | 4.3`
- Notes: high flexibility and potentially strong difficult-case behavior; with `A1`, dominant risk is integration complexity more than licensing process.
- Evidence: G'MIC + unpaper sources.

`H05` ImageMagick -> Leptonica
- Priority: `4.6 | 4.7 | 4.1`
- Criteria: `4.7 | 4.0 | 4.0 | 4.4 | 4.4 | 4.7`
- Notes: best high-upside hybrid that avoids unpaper licensing profile.
- Evidence: ImageMagick + Leptonica + Tesseract quality guidance.

`H06` OCRopus/Kraken front preprocessing -> Tesseract OCR
- Priority: `4.0 | 4.1 | 2.5`
- Criteria: `4.0 | 2.4 | 3.5 | 2.6 | 4.2 | 4.2`
- Notes: quality upside plausible, but runtime reproducibility and packaging burden are major risks.
- Evidence: OCRopus + Kraken sources.

### Custom Candidates

`C01` Custom OpenCV runner (`.exe`)
- Priority: `4.5 | 5.0 | 4.2`
- Criteria: `5.0 | 4.1 | 5.0 | 4.0 | 4.7 | 4.6`
- Notes: strongest deterministic control for operation contract and typed observability.
- Evidence: OpenCV threshold/morph/ximgproc + license.

`C02` Custom Leptonica runner (`.exe`)
- Priority: `4.6 | 4.8 | 4.3`
- Criteria: `4.8 | 4.2 | 5.0 | 4.1 | 4.7 | 4.6`
- Notes: strong document-image pipeline fit with robust utility surface.
- Evidence: Leptonica capabilities + license.

`C03` Custom libvips runner (`.exe`)
- Priority: `4.2 | 4.6 | 3.8`
- Criteria: `4.6 | 4.0 | 5.0 | 4.2 | 3.1 | 4.3`
- Notes: high performance with strong wrapper control; compliance/dependency package still needs review.
- Evidence: libvips docs and license.

`C04` Custom .NET runner (NAPS2 SDK-family)
- Priority: `4.0 | 4.3 | 3.2`
- Criteria: `4.3 | 3.5 | 4.8 | 4.0 | 2.8 | 4.0`
- Notes: candidate is technically plausible; licensing composition requires careful boundary definition.
- Evidence: NAPS2 repo + licensing split (GPL app vs LGPL SDK/images).

`C05` In-process Node path (`sharp`/libvips)
- Priority: `3.7 | 4.1 | 3.3`
- Criteria: `4.1 | 2.8 | 4.2 | 4.0 | 3.5 | 3.8`
- Notes: strong transform performance but weaker process-isolation/kill semantics versus current OCR runner model.
- Evidence: sharp repo + license + libvips dependency note.

`C06` Python OpenCV/scikit-image sidecar
- Priority: `4.0 | 4.9 | 2.8`
- Criteria: `4.9 | 2.6 | 4.8 | 2.9 | 3.4 | 4.2`
- Notes: high algorithm headroom; runtime reliability and packaging complexity are substantial.
- Evidence: OpenCV docs/license + ecosystem practice.

`C07` OCRopus custom sidecar pipeline
- Priority: `3.9 | 4.3 | 2.6`
- Criteria: `4.2 | 2.4 | 4.0 | 2.6 | 4.2 | 4.1`
- Notes: modular command-line composition is attractive; old stack and ops burden reduce reliability confidence.
- Evidence: OCRopus repo.

`C08` Kraken custom sidecar pipeline
- Priority: `4.1 | 4.4 | 2.7`
- Criteria: `4.3 | 2.5 | 4.1 | 2.8 | 4.3 | 4.3`
- Notes: strong difficult-document upside with modern model ecosystem; deployment/runtime complexity is high.
- Evidence: Kraken repo.

`C09` Custom OpenCV + Leptonica combined runner
- Priority: `4.8 | 5.0 | 4.1`
- Criteria: `5.0 | 4.2 | 5.0 | 4.0 | 4.6 | 4.9`
- Notes: highest technical ceiling for quality + controllability among audited candidates.
- Evidence: OpenCV + Leptonica sources.

### Deferred (Not Scored in This Pass)

`D01` GIMP batch preprocessing path
- Reason: key batch documentation URL was inaccessible from the tool in this pass.
- Action: keep as backlog candidate; do not score until source is inspected in-session.

---

## Comparator-App Adoption Audit (Tesseract/Poppler Context)

Comparator set used in this pass:
- `A1` Paperless-ngx setup/config docs: OCRmyPDF + Tesseract chain; `unpaper`; `imagemagick`; `poppler-utils`; `liblept5`.
- `A2` OCRmyPDF docs/repo: OCR on scanned PDFs via Tesseract; explicit `unpaper` integration.
- `A3` pdfsandwich manpage: wrapper using `convert` + `unpaper` + `tesseract` (and `pdfinfo`/`pdfunite` options).
- `A4` gImageReader packaging/docs: front-end to Tesseract with Poppler dependencies.
- `A5` NAPS2 docs/repo: OCR CLI options using Tesseract.
- `A6` Tesseract docs: Tesseract uses Leptonica and does not read PDF directly.

Per-candidate adoption check:

`B01` ImageMagick CLI
- Status: `direct`.
- Examples: `A1` (`imagemagick` for PDF conversion), `A3` (`convert` in OCR wrapper chain).
- Confidence: `high`.

`B02` GraphicsMagick CLI
- Status: `absent` (no verified comparator in `A1..A6` using it in chain).
- Confidence: `medium`.

`B03` libvips CLI
- Status: `absent` (no verified comparator in `A1..A6` using it in chain).
- Confidence: `medium`.

`B04` unpaper CLI
- Status: `direct`.
- Examples: `A1` (`PAPERLESS_OCR_CLEAN` uses `unpaper` before Tesseract), `A2` (Control of `unpaper`), `A3` (`unpaper` in wrapper chain).
- Confidence: `high`.

`B05` G'MIC CLI
- Status: `absent` (no verified comparator in `A1..A6` using it in chain).
- Confidence: `medium`.

`B06` NAPS2 Console
- Status: `direct`.
- Examples: `A5` (`--enableocr`, `--ocrlang`).
- Confidence: `high`.

`B07` ScanTailor Advanced runtime path
- Status: `absent` (no verified comparator in `A1..A6` using it in automated OCR chain).
- Confidence: `medium`.

`B08` Tesseract-internal-only preprocessing
- Status: `direct`.
- Examples: `A1`, `A2`, `A3`, `A4`, `A5` are Tesseract-based OCR apps.
- Confidence: `high`.

`B09` OCRmyPDF-as-runtime
- Status: `direct`.
- Examples: `A1` explicitly states Paperless uses OCRmyPDF for OCR.
- Confidence: `high`.

`B10` Leptonica utility path
- Status: `indirect-strong`.
- Examples: `A6` (Tesseract uses Leptonica), `A1` setup includes `liblept5` in OCR stack dependencies.
- Confidence: `high`.

`B11` OCRopus CLI path
- Status: `absent` (no verified comparator in `A1..A6` combining OCRopus with Tesseract/Poppler chain).
- Confidence: `medium`.

`B12` Kraken CLI path
- Status: `absent` (no verified comparator in `A1..A6` combining Kraken with Tesseract/Poppler chain).
- Confidence: `medium`.

`H01` ImageMagick -> unpaper
- Status: `direct`.
- Examples: `A3` (convert + unpaper + tesseract wrapper chain), `A1` (both tools present in OCR stack).
- Confidence: `high`.

`H02` libvips -> unpaper
- Status: `absent` (no verified comparator in `A1..A6`).
- Confidence: `medium`.

`H03` GraphicsMagick -> unpaper
- Status: `absent` (no verified comparator in `A1..A6`).
- Confidence: `medium`.

`H04` G'MIC -> unpaper
- Status: `absent` (no verified comparator in `A1..A6`).
- Confidence: `medium`.

`H05` ImageMagick -> Leptonica
- Status: `partial`.
- Examples: `A1` includes `imagemagick` and `liblept5`/`tesseract`; explicit sequential chain is not documented.
- Confidence: `medium`.

`H06` OCRopus/Kraken front preprocessing -> Tesseract OCR
- Status: `absent` (no verified comparator in `A1..A6`).
- Confidence: `low`.

`C01` Custom OpenCV runner (`.exe`)
- Status: `absent` (no verified off-the-shelf comparator in `A1..A6`).
- Confidence: `medium`.

`C02` Custom Leptonica runner (`.exe`)
- Status: `indirect`.
- Examples: `A6` confirms Leptonica in Tesseract stack, but no verified dedicated custom-Leptonica runner app in `A1..A6`.
- Confidence: `medium`.

`C03` Custom libvips runner (`.exe`)
- Status: `absent` (no verified comparator in `A1..A6`).
- Confidence: `medium`.

`C04` Custom .NET runner (NAPS2 SDK-family)
- Status: `direct-pattern`.
- Examples: `A5` confirms production .NET OCR app (NAPS2) with Tesseract OCR controls.
- Confidence: `high`.

`C05` In-process Node path (`sharp`/libvips)
- Status: `absent` (no verified comparator in `A1..A6`).
- Confidence: `medium`.

`C06` Python OpenCV/scikit-image sidecar
- Status: `absent` (no verified comparator in `A1..A6`).
- Confidence: `medium`.

`C07` OCRopus custom sidecar pipeline
- Status: `absent` (no verified comparator in `A1..A6`).
- Confidence: `low`.

`C08` Kraken custom sidecar pipeline
- Status: `absent` (no verified comparator in `A1..A6`).
- Confidence: `low`.

`C09` Custom OpenCV + Leptonica combined runner
- Status: `indirect`.
- Examples: Leptonica-side usage is evidenced by `A6`; combined custom runner adoption not verified in `A1..A6`.
- Confidence: `low`.

`D01` GIMP batch preprocessing path
- Status: `unverified`.
- Reason: key docs unavailable in-session for reliable comparator mapping.

How this affects interpretation:
- Comparator adoption strengthens confidence for `B01`, `B04`, `B06`, `B08`, `B09`, `B10`, and `H01`.
- Lack of comparator adoption does not invalidate candidates; it lowers confidence and raises proof burden for later gate stages.

---

## Revised Draft Readout (Priority-Ordered, No Freeze, No Selection)

### Outcome Frontier (Primary then Secondary)

Current top frontier:
- `C09` Custom OpenCV+Leptonica
- `H01` ImageMagick->unpaper
- `H05` ImageMagick->Leptonica
- `C02` Custom Leptonica
- `C01` Custom OpenCV
- `B01` ImageMagick CLI
- `H02` libvips->unpaper
- `B10` Leptonica utility path

Interpretation:
- The strongest product-outcome contenders include both bundled/hybrid and custom paths.
- The previous rigid pass/fail posture would have hidden high-upside paths (`H01`, `C09`, `C02`).
- Policy remains important (`docs/issues/Issue_139.md:26`) but does not erase product-signal visibility.

### Revisited Candidates Previously Over-Constrained

Re-opened and retained as serious contenders:
- `H01`, `H02`, `H03`, `H04` (unpaper hybrids): kept because quality signal is strong; compliance/ops burden is explicit, not hidden.
- `C01`, `C02`, `C09`: now surfaced clearly as top technical quality/control candidates.
- `B11`, `B12`, `C07`, `C08`: retained as exploratory high-upside paths with lower runtime-confidence.

### Highest Uncertainty Before Any Freeze

- True CER/robustness deltas on difficult families for frontier set (`C09`, `H01`, `H05`, `C02`, `C01`, `B01`).
- Reliability under cancellation/timeouts for multi-step hybrid and Python-heavy candidates.
- Final provenance consistency checks for mixed-license delivery scenarios (especially exact FFmpeg build/profile controls in `unpaper` paths).
- Final scoped-lock operation set/order can re-rank `Secondary` and `C1`.

---

## Conclusion (Draft Only)

This matrix is now rebuilt with in-session evidence audit, expanded candidate coverage, and priority-first readout.

No freeze and no selection are made here.
