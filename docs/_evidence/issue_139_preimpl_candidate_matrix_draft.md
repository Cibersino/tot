# Issue 139 - Pre-Implementation Decision Gate

## Criteria 1-6 Matrix (Gate-Closure Pass, Candidate Set Frozen)

Timestamp:
- 2026-03-06 09:56:59 -03:00

Status:
- Gate-closure decision pass completed (pre-implementation).
- Candidate list frozen for Pre-Implementation Decision Gate scope only.
- Selected candidate for implementation proof: `H01` (issue decision already recorded).
- Strongest challenger retained: `H05`.
- No full implementation proof executed for non-selected candidates.
- Existing file updated (no new matrix file).

---

## Frozen Candidate Lists + Evaluation Order (Gate Checkbox 1)

Freeze scope:
- This freeze is for decision-gate closure only; implementation details remain change-controlled by Issue_139 scoped-lock rules.

Bundled/hybrid candidate list and evaluation order (frozen):
1. `B01` ImageMagick CLI
2. `B02` GraphicsMagick CLI
3. `B03` libvips CLI
4. `B04` unpaper CLI
5. `B05` G'MIC CLI
6. `B06` NAPS2 Console
7. `B07` ScanTailor Advanced runtime path
8. `B08` Tesseract-internal-only preprocessing
9. `B09` OCRmyPDF-as-runtime
10. `B10` Leptonica utility path
11. `B11` OCRopus CLI path
12. `B12` Kraken CLI path
13. `H01` ImageMagick -> unpaper
14. `H02` libvips -> unpaper
15. `H03` GraphicsMagick -> unpaper
16. `H04` G'MIC -> unpaper
17. `H05` ImageMagick -> Leptonica
18. `H06` OCRopus/Kraken front preprocessing -> Tesseract OCR

Custom-preprocess candidate list and evaluation order (frozen):
1. `C01` Custom OpenCV runner (`.exe`)
2. `C02` Custom Leptonica runner (`.exe`)
3. `C03` Custom libvips runner (`.exe`)
4. `C04` Custom .NET runner (NAPS2 SDK-family)
5. `C05` In-process Node path (`sharp`/libvips)
6. `C06` Python OpenCV/scikit-image sidecar
7. `C07` OCRopus custom sidecar pipeline
8. `C08` Kraken custom sidecar pipeline
9. `C09` Custom OpenCV + Leptonica combined runner

Deferred backlog (not scored in this gate closure):
- `D01` GIMP batch preprocessing path

---

## Gate Rule Used for Criteria 1-5 Pass/Fail

- `C1..C5` are marked `PASS` when score is `>= 3.0` and no blocker note contradicts Issue_139 constraints.
- Any `C1..C5` below `3.0` marks candidate `FAIL` for gate pass condition.
- `C6` is mandatory decision input with confidence notes; it is non-gating by Issue_139.

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

## Per-Candidate Gate Results (Gate Checkbox 2)

Passing candidates (`C1..C5` pass condition met):
- `B01`: `PASS`; `C6=4.6`; confidence `high`; broad preprocess control and strong comparator-chain support.
- `B02`: `PASS`; `C6=3.4`; confidence `medium`; passes gate but capability-source stability is partial.
- `B03`: `PASS`; `C6=3.9`; confidence `medium`; passes gate with runtime-orchestration complexity risk.
- `B04`: `PASS`; `C6=4.4`; confidence `high`; quality signal strong, compliance/packaging controls required.
- `B10`: `PASS`; `C6=4.1`; confidence `high`; strong document-image fit and permissive licensing signal.
- `H01`: `PASS`; `C6=4.8`; confidence `high`; strongest bundled/hybrid quality + reliability signal.
- `H02`: `PASS`; `C6=4.6`; confidence `medium`; quality upside but runtime complexity is higher.
- `H03`: `PASS`; `C6=4.4`; confidence `medium`; viable hybrid with weaker direct capability certainty vs `H01`.
- `H05`: `PASS`; `C6=4.7`; confidence `medium`; strongest non-unpaper hybrid challenger.
- `C01`: `PASS`; `C6=4.6`; confidence `medium`; very strong control/observability ceiling.
- `C02`: `PASS`; `C6=4.6`; confidence `medium`; strong custom document-image path.
- `C03`: `PASS`; `C6=4.3`; confidence `medium`; viable custom path with dependency/compliance packaging risk.
- `C09`: `PASS`; `C6=4.9`; confidence `low`; highest technical ceiling with highest delivery complexity burden.

Non-passing candidates (`C1..C5` pass condition not met):
- `B05`: `FAIL` (`C5`); `C6=3.8`; confidence `medium`; compliance viability too weak for this gate.
- `B06`: `FAIL` (`C1`, `C3`, `C5`); `C6=3.2`; confidence `high`; control/observability mismatch.
- `B07`: `FAIL` (`C1`, `C2`, `C3`, `C4`, `C5`); `C6=3.0`; confidence `medium`; interactive-first path.
- `B08`: `FAIL` (`C1`, `C3`); `C6=2.9`; confidence `high`; insufficient operation-level control surface.
- `B09`: `FAIL` (`C1`, `C2`, `C3`); `C6=3.7`; confidence `high`; full OCR pipeline model, not tight preprocess adapter.
- `B11`: `FAIL` (`C2`, `C4`); `C6=3.9`; confidence `medium`; runtime/deployment reliability concerns.
- `B12`: `FAIL` (`C2`, `C4`); `C6=4.1`; confidence `medium`; deployment model misaligned to current target path.
- `H04`: `FAIL` (`C2`); `C6=4.3`; confidence `medium`; runtime-policy reliability below gate threshold.
- `H06`: `FAIL` (`C2`, `C4`); `C6=4.2`; confidence `low`; high runtime and packaging risk.
- `C04`: `FAIL` (`C5`); `C6=4.0`; confidence `high`; licensing composition not yet clean enough for gate pass.
- `C05`: `FAIL` (`C2`); `C6=3.8`; confidence `medium`; in-process kill/cancel semantics weaker than current model.
- `C06`: `FAIL` (`C2`, `C4`); `C6=4.2`; confidence `medium`; Python-side runtime reproducibility risk.
- `C07`: `FAIL` (`C2`, `C4`); `C6=4.1`; confidence `low`; stack age + ops burden reduce reliability confidence.
- `C08`: `FAIL` (`C2`, `C4`); `C6=4.3`; confidence `low`; deployment burden too high for current delivery path.

Deferred:
- `D01`: not scored in this gate; source access was incomplete in-session.

Confidence basis:
- Derived from source stability plus comparator-app adoption confidence in this file's audit sections.

---

## Capability-Gap Analysis from Candidate Results (Gate Checkbox 3)

Passing bundled/hybrid candidates:
- `B01`, `B02`, `B03`, `B04`, `B10`, `H01`, `H02`, `H03`, `H05`

Passing custom candidates:
- `C01`, `C02`, `C03`, `C09`

Gap conclusion:
- A custom preprocess `.exe` is not justified at this gate because bundled/hybrid paths already pass `C1..C5`, including strong quality-potential contenders (`H01`, `H05`).
- Therefore, Issue_139 bundled-binary-first policy remains satisfied without capability-gap escalation.

Decision implication:
- Keep implementation path at `H01`.
- Keep `H05` as first re-selection challenger if `H01` fails full implementation proof.
- Re-open custom shortlist only if both `H01` and `H05` fail proof or show structural inability to meet gate-quality outcomes.

---

## Non-Selected Candidate Evidence Scope (Gate Checkbox 4)

Evidence scope rule applied:
- Non-selected candidates retain capability/risk evidence only.
- No full in-app implementation proof executed for non-selected candidates.
- No production packaging artifacts produced for non-selected candidates.
- No non-selected candidate progressed beyond decision-gate evidence depth.

Non-selected set in this closure:
- `B01`, `B02`, `B03`, `B04`, `B05`, `B06`, `B07`, `B08`, `B09`, `B10`, `B11`, `B12`
- `H02`, `H03`, `H04`, `H05`, `H06`
- `C01`, `C02`, `C03`, `C04`, `C05`, `C06`, `C07`, `C08`, `C09`
- `D01` (deferred)

---

## Revised Readout (Priority-Ordered, Frozen Gate, Selection Active)

Outcome frontier (quality/reliability first):
- `H01` ImageMagick -> unpaper
- `H05` ImageMagick -> Leptonica
- `C09` Custom OpenCV + Leptonica
- `C02` Custom Leptonica
- `C01` Custom OpenCV
- `B01` ImageMagick CLI

Decision readout:
- Selected now: `H01`.
- Strongest challenger: `H05`.
- Why: `H01` combines top quality signal, acceptable gate pass on `C1..C5`, and strong comparator-chain confidence in Tesseract/Poppler ecosystems.

Main uncertainty carried into implementation proof:
- Actual CER delta under Issue_139 challenging families.
- Runtime robustness under timeout/cancel/fail-fast behavior at production-like load.
- Final release-provenance discipline for mixed-license dependency chain.

---

## Conclusion (Gate Closure)

Pre-Implementation Decision Gate evidence now includes:
- Frozen bundled/custom lists with evaluation order.
- Per-candidate `C1..C5` pass/fail and `C6` quality/confidence notes.
- Capability-gap conclusion.
- Explicit non-selected light-evidence scope.

Gate selection remains `H01` with `H05` as first challenger.

---

## H01 Substrate Conditions Readout (Pre-Batch1 Clarification)

This section defines the binding conditions introduced by the selected substrate path `H01` (`ImageMagick -> unpaper`) and how they must be handled in later batches.

License/compliance conditions and limitations:
- Source signal: ImageMagick publishes its own license terms and redistribution notices requirements (`https://imagemagick.org/license/`).
- Source signal: unpaper repository declares project license as GNU GPL v2 (`https://github.com/unpaper/unpaper`), with additional per-file SPDX variations noted upstream.
- Source signal: unpaper README declares hard dependency on FFmpeg for file input/output (`https://github.com/unpaper/unpaper`).
- Practical limitation: H01 cannot be treated as "single-license/simple notice"; release evidence must track both direct tool licenses and package-chain/transitive runtime licensing.
- Required handling: no preprocess release artifact can pass legal gate unless `THIRD_PARTY_NOTICES.md` and `third_party_licenses/**` fully cover ImageMagick, unpaper, and the exact package-chain dependencies bundled.

Artifact construction + hosting conditions:
- Repo model anchor: sidecars are packaged from `ocr/**` via `electron-builder.extraResources` (`package.json`).
- Repo model anchor: runtime resolves sidecars from explicit/env/resources/app roots and does not use system `PATH` (`ocr/README.md`, `electron/import_ocr/platform/resolve_sidecar.js`).
- Current-state check: `ocr/win32-x64/preprocess` exists but is currently empty (no preprocess runtime artifacts committed yet).
- Binding output contract for active target:
  - `ocr/win32-x64/preprocess/imagemagick/**`
  - `ocr/win32-x64/preprocess/unpaper/**`
- Hosting decision (this issue scope): keep preprocess runtime artifacts hosted in-repo under `ocr/**`, same as current OCR sidecar model; any hosting-model change requires issue + evidence update before merge.
- Required evidence at artifact build time: upstream source URL/version, acquisition/build commands, source hashes, final shipped inventory + hashes.

Packaging conditions (Windows in-scope, Linux/macOS availability path):
- Scope anchor: Issue_139 ships preprocess sidecars only for `win32-x64` in this issue.
- Architecture anchor: target registry already includes `win32-x64`, `linux-x64`, `darwin-x64`, `darwin-arm64` (`electron/import_ocr/platform/profile_registry.js`).
- Binding requirement: preserve cross-target directory contract for preprocess bundles even when non-Windows artifacts are not shipped in this issue:
  - `ocr/linux-x64/preprocess/`
  - `ocr/darwin-x64/preprocess/`
  - `ocr/darwin-arm64/preprocess/`
- Runtime policy remains explicit: missing preprocess runtime maps to `OCR_BINARY_MISSING` and no silent fallback.
- When Linux/macOS preprocess artifacts are introduced later, release packaging must include those bundles and attach cross-target smoke evidence (`docs/releases/ocr_cross_target_smoke_matrix.md`) per distributed target.

Carry-forward execution mapping:
- Batch 1: substrate constraints documented and evidenced (this section + issue + evidence log).
- Batch 2: build and wire `win32-x64` preprocess artifacts under required layout; prove runtime mapping and missing-binary handling.
- Batch 5: update notices/licenses and pass release legal/post-packaging gates with preprocess components included.
