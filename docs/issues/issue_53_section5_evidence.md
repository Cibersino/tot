# Issue 53 Section 5 Evidence

Linked plan: `docs/issues/issue_53_implementation_plan.md`  
Linked tracker: `docs/issues/issue_53_operation_tracker.md`  
Scope: Section 5 (`Smoke test and quality gate for the basic`)

## Purpose

Keep detailed, auditable evidence for all Section 5 checklist items in one place.

Tracker policy for Section 5:
- `docs/issues/issue_53_operation_tracker.md` stays minimal (operation summary + checklist toggles + references).
- this file stores full test details (steps, expected/actual, artifacts, pass/fail, drift disclosures).

## Evidence Protocol

- Record one case/result block per executed test.
- Include exact fixture path(s), route, expected result, actual result, and status (`PASS`/`FAIL`/`BLOCKED`).
- Include user-observed UI behavior verbatim when relevant.
- Include command/log evidence where available.
- Log any drift immediately in `## Drift Log`.

## Environment Snapshot

- Date/time started: `2026-03-15 13:33:24 -03:00`
- OS: `Microsoft Windows 10.0.26200`
- App version/commit: `0.1.6` / `dde9fd1`
- Runtime command: ``$env:TOT_LOG_LEVEL='info'; npm start``
- TOT_LOG_LEVEL: `info`
- OCR credentials path: `%APPDATA%\\@cibersino\\tot\\config\\ocr_google_drive\\credentials.json`
- OCR token path: `%APPDATA%\\@cibersino\\tot\\config\\ocr_google_drive\\token.json`

## Section 5 Checklist Coverage Map

1. Build and run core smoke matrix (OCR, native, PDF triage, dual-route choice)
- Status: `COMPLETED`
- Evidence blocks: `SMK-01`, `SMK-02`, `SMK-03`, `SMK-04`, `SMK-05`

2. Add multilingual smoke coverage across OCR + native routes (at least Latin, CJK, and RTL samples)
- Status: `COMPLETED`
- Evidence blocks: `SMK-01` (Latin/native), `SMK-02` (Latin/OCR), `MLG-02` (RTL/native), `MLG-03` (CJK/OCR)

3. Run native-route fixture matrix (format coverage + corrupt/encrypted/empty-text-layer cases)
- Status: `COMPLETED`
- Evidence blocks: `SMK-01` (docx success reuse), `SMK-04`/`MLG-02` (pdf success reuse), `NFM-A` (txt/md/html success), `NFM-B` (corrupt/encrypted native failure rerun pass), OP-0053 direct-native probes (supporting evidence)

4. Validate precondition rejection scenarios and explicit reason messaging
- Status: `COMPLETED`
- Evidence blocks: `PRC-01`

5. Validate processing lock behavior (distinct from startup lock; only close/minimize/move/abort available)
- Status: `PENDING`
- Evidence blocks: none yet

6. Validate close-window-during-processing cancellation path and invariants
- Status: `PENDING`
- Evidence blocks: none yet

7. Validate failure/abort invariants and state separation
- Status: `PENDING`
- Evidence blocks: none yet

8. Validate access / billing / activation model behavior (activation gating, restriction paths, quota/budget/usage-limit failures)
- Status: `PENDING`
- Evidence blocks: none yet

9. Validate canonical apply behavior (overwrite/append/repetitions, MAX_TEXT_CHARS, truncation notice)
- Status: `PENDING`
- Evidence blocks: none yet

10. Validate observability coverage for required fields/events
- Status: `PENDING`
- Evidence blocks: none yet

11. Block progression until basic smoke/quality gate passes
- Status: `PENDING`
- Evidence blocks: none yet

## Section 5 Item 1: Core Smoke Matrix

### SMK-01 Native Baseline

- Objective: Verify non-PDF native extraction route end-to-end, including post-extraction apply modal and overwrite apply path.
- Fixture: `tools_local/smoke/prueba_docx.docx`
- Preconditions:
  - no secondary windows open
  - stopwatch stopped
- Steps:
  - click import/extract button in main selector row
  - select `tools_local/smoke/prueba_docx.docx`
  - confirm no route-choice modal appears
  - in apply modal set repetitions=`1` and click `Overwrite`
- Expected:
  - extraction executes without OCR activation flow
  - no route-choice modal appears
  - apply modal appears after extraction success
  - overwrite applies extracted text to current text
- Actual:
  - preconditions ok: `yes`
  - route-choice modal shown: `no`
  - apply modal shown: `yes`
  - overwrite applied: `yes`
  - resulting text starts with:
    - `How many words do we read per minute?`
    - `A review and meta-analysis of reading rate`
- Alerts/notifications observed: `none`
- Route metadata observed:
  - from main-process terminal logs:
    - `routeKind: 'native'`
    - `state: 'success'`
    - `pdfTriage: 'not_pdf'`
    - `triageReason: 'non_pdf'`
    - `availableRoutes: [ 'native' ]`
    - `chosenRoute: 'native'`
    - `executedRoute: 'native'`
    - `sourceFileExt: 'docx'`
    - `sourceFileKind: 'text_document'`
- Result: `PASS`
- Notes:
  - backend dry-run probe (pre-manual) indicates native parser readiness for this fixture:
    - `runNativeExtractionRoute('tools_local/smoke/prueba_docx.docx') -> state=success, len=130692`
  - user-provided runtime evidence confirms processing-mode lock lifecycle for this case:
    - `Processing mode enabled ... reason: 'run_route'`
    - `Processing mode disabled ... reason: 'import_extract_native_success'`
  - user-provided renderer DevTools evidence confirms synchronized processing-mode state transitions:
    - `active: true` on start
    - `active: false` on completion
  - execution command observed:
    - ``$env:TOT_LOG_LEVEL='debug'; npm start``

### SMK-02 OCR Baseline

- Objective: Verify OCR route for image files with activation-aware behavior and post-extraction apply modal.
- Fixture: `tools_local/smoke/prueba_png.png`
- Preconditions: same as SMK-01
- Steps:
  - attempt 1:
    - user selected `tools_local/smoke/prueba_png.png` from import/extract picker
    - no route-choice modal appeared
    - extraction exited in failure state before apply modal
  - repair applied in `OP-0045`:
    - extended OCR auto-recovery to treat `auth_failed` as recoverable
  - rerun (attempt 2):
    - user repeated OCR baseline flow
    - activation flow was launched and completed in browser
    - extraction retried automatically and succeeded
- Expected: OCR path executes; apply modal appears after success.
- Actual:
  - attempt 1:
    - preconditions ok: `yes`
    - route-choice modal: `no`
    - apply modal: `no`
    - overwrite applied: `no`
    - resulting text lines: `n/a` (no apply step reached)
  - attempt 2 (post-repair rerun):
    - preconditions ok: `yes`
    - route-choice modal: `no`
    - apply modal: `yes`
    - overwrite applied: `yes`
    - resulting text starts with:
      - `________________`
      - `MATÍAS MAIELLO`
      - `85`
- Alerts/notifications observed:
  - attempt 1:
    - `OCR is unavailable. Check setup/auth status and try again.`
  - attempt 2:
    - `Starting OCR activation. Complete sign-in in your browser to continue.`
    - `OCR activation completed. Retrying extraction.`
- Route metadata observed:
  - attempt 1:
    - `routeKind: 'ocr'`
    - `state: 'failure'`
    - `code: 'auth_failed'`
    - `pdfTriage: 'not_pdf'`
    - `triageReason: 'non_pdf'`
    - `availableRoutes: [ 'ocr' ]`
    - `chosenRoute: 'ocr'`
    - `executedRoute: 'ocr'`
    - `sourceFileExt: 'png'`
    - `sourceFileKind: 'image'`
  - attempt 2:
    - first pass in rerun:
      - `routeKind: 'ocr'`
      - `state: 'failure'`
      - `code: 'ocr_activation_required'`
      - `reason: import_extract_ocr_failed`
    - activation status:
      - `import/extract OCR activation completed: { ok: true, state: 'ready', code: '', importedCredentials: false }`
    - retried pass:
      - `routeKind: 'ocr'`
      - `state: 'success'`
      - `code: ''`
      - `pdfTriage: 'not_pdf'`
      - `triageReason: 'non_pdf'`
      - `availableRoutes: [ 'ocr' ]`
      - `chosenRoute: 'ocr'`
      - `executedRoute: 'ocr'`
      - `sourceFileKind: 'image'`
- Result: `PASS`
- Notes:
  - processing mode lifecycle was correct across both attempts.
  - rerun confirms repair effectiveness: `auth_failed` now reaches activation/reconnect flow and succeeds after one-shot retry.

### SMK-03 PDF Triage `ocr_only`

- Objective: Verify PDF triage chooses OCR-only path when native text layer is not usable.
- Fixture: `tools_local/smoke/prueba_pdf_2_escaneado_12_paginas.pdf`
- Preconditions: same as SMK-01
- Steps:
  - user selected `tools_local/smoke/prueba_pdf_2_escaneado_12_paginas.pdf` from import/extract picker
  - no route-choice modal appeared
  - extraction completed successfully
  - apply modal was shown and user applied `Overwrite` with repetitions=`1`
- Expected: no route-choice modal; PDF triage resolves to `ocr_only`; OCR executes.
- Actual:
  - preconditions ok: `yes`
  - route-choice modal: `no`
  - apply modal: `yes`
  - overwrite applied: `yes`
  - resulting text starts with:
    - `Introduction • 3`
    - `Permanent revolution in the early writings of Marx and Engels ...`
- Alerts/notifications observed: `none`
- Route metadata observed:
  - from main-process terminal logs:
    - `routeKind: 'ocr'`
    - `state: 'success'`
    - `code: ''`
    - `pdfTriage: 'ocr_only'`
    - `triageReason: 'no_native_text_layer_detected'`
    - `availableRoutes: [ 'ocr' ]`
    - `chosenRoute: 'ocr'`
    - `executedRoute: 'ocr'`
    - `sourceFileExt: 'pdf'`
    - `sourceFileKind: 'pdf'`
- Result: `PASS`
- Notes:
  - processing-mode lifecycle matched expectations for PDF OCR path:
    - enabled with `reason: 'run_pdf_route'`
    - disabled with `reason: 'import_extract_ocr_success'`

### SMK-04 PDF Triage `both` -> choose `native`

- Objective: Verify explicit route-choice UX for dual-route PDF and native branch execution.
- Fixture: `tools_local/smoke/prueba_pdf_original_12_paginas.pdf`
- Preconditions: same as SMK-01 + OCR available for `both` outcome
- Steps:
  - user selected `tools_local/smoke/prueba_pdf_original_12_paginas.pdf` from import/extract picker
  - route-choice modal appeared
  - user selected `native`
  - extraction completed successfully
  - apply modal was shown and user applied `Overwrite` with repetitions=`1`
- Expected: route-choice modal appears; choosing `native` executes native route.
- Actual:
  - preconditions ok: `yes`
  - route-choice modal: `yes`
  - route chosen: `native`
  - apply modal: `yes`
  - overwrite applied: `yes`
  - resulting text starts with:
    - `1`
    - `How many words do we read per minute?`
    - `A review and meta-analysis of reading rate`
- Alerts/notifications observed: `none`
- Route metadata observed:
  - from main-process terminal logs:
    - `routeKind: 'native'`
    - `state: 'success'`
    - `code: ''`
    - `pdfTriage: 'both'`
    - `triageReason: 'native_text_detected_and_ocr_ready_preferred_native'`
    - `availableRoutes: [ 'native', 'ocr' ]`
    - `chosenRoute: 'native'`
    - `executedRoute: 'native'`
    - `sourceFileExt: 'pdf'`
    - `sourceFileKind: 'text_document'`
- Result: `PASS`
- Notes:
  - route-choice UX behaved as expected for `pdfTriage=both`.
  - observability note: completion log reports `sourceFileKind: 'text_document'` for this PDF native execution path.

### SMK-05 PDF Triage `both` -> choose `ocr`

- Objective: Verify explicit route-choice UX for dual-route PDF and OCR branch execution.
- Fixture: `tools_local/smoke/prueba_pdf_original_12_paginas.pdf`
- Preconditions: same as SMK-04
- Steps:
  - user selected `tools_local/smoke/prueba_pdf_original_12_paginas.pdf` from import/extract picker
  - route-choice modal appeared
  - user selected `ocr`
  - extraction completed successfully
  - apply modal was shown and user applied `Overwrite` with repetitions=`1`
- Expected: route-choice modal appears; choosing `ocr` executes OCR route.
- Actual:
  - preconditions ok: `yes`
  - route-choice modal: `yes`
  - route chosen: `ocr`
  - apply modal: `yes`
  - overwrite applied: `yes`
  - resulting text starts with:
    - `How many words do we read per minute?`
    - `A review and meta-analysis of reading rate`
    - `Marc Brysbaert`
- Alerts/notifications observed: `none`
- Route metadata observed:
  - from main-process terminal logs:
    - `routeKind: 'ocr'`
    - `state: 'success'`
    - `code: ''`
    - `pdfTriage: 'both'`
    - `triageReason: 'native_text_detected_and_ocr_ready_preferred_ocr'`
    - `availableRoutes: [ 'native', 'ocr' ]`
    - `chosenRoute: 'ocr'`
    - `executedRoute: 'ocr'`
    - `sourceFileExt: 'pdf'`
    - `sourceFileKind: 'pdf'`
- Result: `PASS`
- Notes:
  - route-choice UX behaved as expected for `pdfTriage=both`.
  - processing mode transitions were correct (`run_pdf_route` -> `import_extract_ocr_success`).

## Section 5 Item 2: Multilingual Coverage

Coverage strategy:
- Reuse validated Latin-script evidence from Section 5 item 1:
  - native baseline: `SMK-01` (`tools_local/smoke/prueba_docx.docx`)
  - OCR baseline: `SMK-02` (`tools_local/smoke/prueba_png.png`)
- Add only missing-script deltas for item 2:
  - `MLG-02` RTL/native (this block)
  - `MLG-03` CJK/OCR

### MLG-02 RTL + Native

- Objective: Validate RTL script coverage through the native route.
- Fixture: `tools_local/smoke/prueba_arabe_pdf.pdf`
- Preconditions:
  - no secondary windows open
  - stopwatch stopped
- Steps:
  - user started app with:
    - ``$env:TOT_LOG_LEVEL='debug'; npm start``
  - user selected `tools_local/smoke/prueba_arabe_pdf.pdf` from import/extract picker
  - route-choice modal appeared and user selected `native`
  - apply modal appeared and user applied `Overwrite` with repetitions=`1`
- Expected:
  - extraction succeeds through native route with RTL text output
  - explicit route choice honored with no silent fallback
  - apply modal appears and overwrite applies extracted text
- Actual:
  - preconditions ok: `yes`
  - route-choice modal: `yes`
  - route chosen: `native`
  - apply modal: `yes`
  - overwrite applied: `yes`
  - resulting text starts with:
    - `4`
    - `آہوقرس`
    - `أراحابوقیںصدرهفوقالترابالندئ»فبدأتالأرض`
    - `تخفقمنتحته:ضرياتقلبمتحبتطوففىذراتالرمل`
- Alerts/notifications observed: `none`
- Route metadata observed:
  - from main-process terminal logs:
    - `routeKind: 'native'`
    - `state: 'success'`
    - `code: ''`
    - `pdfTriage: 'both'`
    - `triageReason: 'native_text_detected_and_ocr_ready_preferred_native'`
    - `availableRoutes: [ 'native', 'ocr' ]`
    - `chosenRoute: 'native'`
    - `executedRoute: 'native'`
    - `sourceFileExt: 'pdf'`
    - `sourceFileKind: 'text_document'`
- Result: `PASS`
- Notes:
  - user-provided processing-mode lifecycle evidence:
    - `Processing mode enabled ... reason: 'run_pdf_route'`
    - `Processing mode disabled ... reason: 'import_extract_native_success'`
  - user-provided renderer logs confirm synchronized processing-mode transitions:
    - `{active: true, reason: 'run_pdf_route'}`
    - `{active: false, reason: 'import_extract_native_success'}`

### MLG-03 CJK + OCR

- Objective: Validate CJK script coverage through the OCR route.
- Fixture: `tools_local/smoke/prueba_japones_webp.webp`
- Preconditions:
  - no secondary windows open
  - stopwatch stopped
- Steps:
  - user started app with:
    - ``$env:TOT_LOG_LEVEL='debug'; npm start``
  - user selected `tools_local/smoke/prueba_japones_webp.webp` from import/extract picker
  - no route-choice modal appeared
  - apply modal appeared and user applied `Overwrite` with repetitions=`1`
- Expected:
  - extraction succeeds through OCR route with CJK text output
  - no route-choice modal for image fixture
  - apply modal appears and overwrite applies extracted text
- Actual:
  - preconditions ok: `yes`
  - route-choice modal: `no`
  - route chosen: `n/a`
  - apply modal: `yes`
  - overwrite applied: `yes`
  - resulting text starts with:
    - `________________`
    - `0`
    - `「忠」という漢字が作られ、 水や酒などの液体を容器にそそぎこむ動作を表す`
    - `ために 「注」という漢字が作られました。 穀物がたわわに実ったことを神に感 謝するために 「豊」 という漢字が作られ`
- Alerts/notifications observed: `none`
- Route metadata observed:
  - from main-process terminal logs:
    - `routeKind: 'ocr'`
    - `state: 'success'`
    - `code: ''`
    - `pdfTriage: 'not_pdf'`
    - `triageReason: 'non_pdf'`
    - `availableRoutes: [ 'ocr' ]`
    - `chosenRoute: 'ocr'`
    - `executedRoute: 'ocr'`
    - `sourceFileExt: 'webp'`
    - `sourceFileKind: 'image'`
- Result: `PASS`
- Notes:
  - user-provided processing-mode lifecycle evidence:
    - `Processing mode enabled ... reason: 'run_route'`
    - `Processing mode disabled ... reason: 'import_extract_ocr_success'`
  - user-provided renderer logs confirm synchronized processing-mode transitions:
    - `{active: true, reason: 'run_route'}`
    - `{active: false, reason: 'import_extract_ocr_success'}`

## Section 5 Item 3: Native Fixture Matrix

Coverage strategy:
- Reuse existing native success evidence to avoid duplicate reruns:
  - `SMK-01` for `.docx` success
  - `SMK-04` and `MLG-02` for `.pdf` with usable text layer (native selected + success)
- Execute only missing matrix deltas:
  - `NFM-A` for `.txt` + `.md` + `.html` success
  - `NFM-B` for `corrupt` + `encrypted` fixture behavior in UI flow
  - empty-text-layer coverage reuses existing evidence with native probe/warnings:
    - `SMK-03` fixture family (`pdfTriage: ocr_only`) + `OP-0053` native direct probes for flattened/scanned PDFs (`native_empty_text`)

### NFM-A Native Success Batch (`txt` + `md` + `html`)

- Objective: Validate remaining native success-format coverage without repeating already-covered `docx`/`pdf` success cases.
- Fixtures:
  - `tools_local/smoke/prueba_txt.txt`
  - `tools_local/smoke/prueba_md.md`
  - `tools_local/smoke/prueba_html.html`
- Preconditions:
  - no secondary windows open
  - stopwatch stopped
- Steps:
  - user started app with:
    - ``$env:TOT_LOG_LEVEL='debug'; npm start``
  - user executed import/extract for all three fixtures in one session
  - no route-choice modal appeared in the batch
  - apply modal appeared and apply action(s) were executed for each run
- Expected:
  - all three files execute native route successfully
  - no route-choice modal appears
  - no silent fallback
- Actual (batch-level, user-reported):
  - preconditions ok: `yes`
  - route-choice modal: `no`
  - apply modal: `yes`
  - overwrite applied: `yes`
  - append applied: `yes`
  - repetitions applied: `yes`
  - alerts seen: `none`
  - resulting text fragments include all three fixture families (`txt`, `md`, `html`) in output stream
- Route metadata observed (main-process logs):
  - run 1 (`prueba_txt.txt`):
    - `routeKind: 'native'`
    - `state: 'success'`
    - `code: ''`
    - `pdfTriage: 'not_pdf'`
    - `triageReason: 'non_pdf'`
    - `availableRoutes: [ 'native' ]`
    - `chosenRoute: 'native'`
    - `executedRoute: 'native'`
    - `sourceFileExt: 'txt'`
    - `sourceFileKind: 'text_document'`
  - run 2 (`prueba_md.md`):
    - `routeKind: 'native'`
    - `state: 'success'`
    - `code: ''`
    - `pdfTriage: 'not_pdf'`
    - `triageReason: 'non_pdf'`
    - `availableRoutes: [ 'native' ]`
    - `chosenRoute: 'native'`
    - `executedRoute: 'native'`
    - `sourceFileExt: 'md'`
    - `sourceFileKind: 'text_document'`
  - run 3 (`prueba_html.html`):
    - `routeKind: 'native'`
    - `state: 'success'`
    - `code: ''`
    - `pdfTriage: 'not_pdf'`
    - `triageReason: 'non_pdf'`
    - `availableRoutes: [ 'native' ]`
    - `chosenRoute: 'native'`
    - `executedRoute: 'native'`
    - `sourceFileExt: 'html'`
    - `sourceFileKind: 'text_document'`
- Result: `PASS`
- Notes:
  - user-provided renderer logs show three clean processing-mode cycles (`lockId: 1`, `2`, `3`) with `run_route -> import_extract_native_success`.
  - batch report is aggregated by design; item-3 objective here is route/format coverage rather than apply-mode semantics (covered separately in item 9).

### NFM-B Failure Batch (`corrupt` + `encrypted` PDFs)

- Objective: Validate native fixture matrix failure coverage for corrupt/encrypted cases via manual UI flow.
- Fixtures:
  - `tools_local/smoke/prueba_pdf_corrupto.pdf`
  - `tools_local/smoke/prueba_pdf_encriptado.pdf`
- Preconditions:
  - no secondary windows open
  - stopwatch stopped
- Steps:
  - user started app with:
    - ``$env:TOT_LOG_LEVEL='debug'; npm start``
  - user executed import/extract for both fixtures
  - no route-choice modal appeared in the batch
  - apply modal did not appear
- Expected:
  - explicit native failure handling for both fixtures
  - no apply modal on failure
  - no OCR fallback execution
- Actual (post-fix rerun, user-reported):
  - preconditions ok: `yes`
  - route-choice modal: `no`
  - apply modal: `no`
  - alerts seen:
    - corrupt fixture: `The selected file is unreadable or corrupt for native extraction.`
    - encrypted fixture: `The selected PDF is encrypted or password-protected and cannot be extracted natively.`
  - resulting text: `n/a`
- Route metadata observed (main-process logs):
  - corrupt fixture:
    - native parser warning:
      - `errorName: 'InvalidPDFException'`
      - `parserType: 'pdf_text_layer'`
    - execution completion:
      - `routeKind: 'native'`
      - `state: 'failure'`
      - `code: 'unreadable_or_corrupt'`
      - `pdfTriage: 'native_only'`
      - `triageReason: 'native_pdf_corrupt_or_unreadable'`
      - `nativeProbeCode: 'unreadable_or_corrupt'`
      - `nativeProbeErrorName: 'InvalidPDFException'`
      - `nativeProbeErrorCode: ''`
      - `availableRoutes: [ 'native' ]`
      - `chosenRoute: 'native'`
      - `executedRoute: 'native'`
      - `sourceFileExt: 'pdf'`
      - `sourceFileKind: 'text_document'`
  - encrypted fixture:
    - native parser warning:
      - `errorName: 'PasswordException'`
      - `parserType: 'pdf_text_layer'`
      - `errorCode: '1'`
    - execution completion:
      - `routeKind: 'native'`
      - `state: 'failure'`
      - `code: 'native_encrypted_or_password_protected'`
      - `pdfTriage: 'native_only'`
      - `triageReason: 'native_pdf_password_protected'`
      - `nativeProbeCode: 'native_encrypted_or_password_protected'`
      - `nativeProbeErrorName: 'PasswordException'`
      - `nativeProbeErrorCode: '1'`
      - `availableRoutes: [ 'native' ]`
      - `chosenRoute: 'native'`
      - `executedRoute: 'native'`
      - `sourceFileExt: 'pdf'`
      - `sourceFileKind: 'text_document'`
- Result: `PASS`
- Notes:
  - post-fix rerun confirms route/error separation is now explicit and no OCR runtime misclassification is shown for these native failure fixtures.
  - user-provided renderer logs show failure processing-mode cycles on native path:
    - `run_pdf_route -> import_extract_native_failed` for both runs.

## Section 5 Item 4: Precondition Rejection and Explicit Reason Messaging

### PRC-01 Precondition Rejection (`secondary window open` + `stopwatch running`)

- Objective: Validate that import/extract start is blocked when required preconditions are not met and user-facing reason messaging is explicit.
- Fixtures: `n/a` (precondition gate executes before extraction route selection)
- Preconditions:
  - no secondary windows open + stopwatch stopped was validated before running this card
  - attempt 1 state:
    - secondary text editor window open
    - stopwatch stopped
  - attempt 2 state:
    - no secondary windows open
    - stopwatch running
- Steps:
  - user started app with:
    - ``$env:TOT_LOG_LEVEL='debug'; npm start``
  - user attempted import/extract while secondary editor window was open
  - user then closed secondary window, started stopwatch, and attempted import/extract again
- Expected:
  - both attempts are blocked before route execution
  - explicit alert guidance is shown in each blocked attempt
  - no route-choice modal and no apply modal are shown
- Actual (user-reported):
  - preconditions ok: `yes`
  - route-choice modal: `no`
  - apply modal: `no`
  - overwrite applied: `n/a`
  - append applied: `n/a`
  - repetitions applied: `n/a`
  - secondary window open: `yes` (attempt 1)
  - stopwatch running: `yes` (attempt 2)
  - alerts seen:
    - with text editor window open:
      - `To start import/extract, close all secondary windows and stop the stopwatch.`
    - with stopwatch running:
      - `To start import/extract, close all secondary windows and stop the stopwatch.`
  - resulting text: `n/a`
- Preconditions telemetry observed (main-process logs):
  - attempt 1:
    - `import-extract precondition_rejected`
    - `openSecondaryWindowIds: [ 'editor' ]`
    - `openSecondaryWindowCount: 1`
    - `stopwatchRunning: false`
  - attempt 2:
    - `import-extract precondition_rejected`
    - `openSecondaryWindowIds: []`
    - `openSecondaryWindowCount: 0`
    - `stopwatchRunning: true`
- Renderer evidence:
  - renderer console contains startup/module logs only
  - no processing-mode start/stop transitions were emitted during blocked attempts
- Result: `PASS`
- Notes:
  - evidence confirms explicit precondition-rejection reason telemetry and explicit user guidance message for both gate conditions.

## Drift Log

- `SMK-01` used `TOT_LOG_LEVEL='debug'` instead of the initial planned `info`.
  - Drifted instruction/context: Section 5 evidence prefill listed runtime command with `info`.
  - Why: user executed with `debug` and provided richer logs.
  - Impact/risk: low; increased log verbosity only, no behavior change expected.
  - Handling: proceeded and recorded exact observed runtime context in evidence.
- `SMK-02` also used `TOT_LOG_LEVEL='debug'` (same low-impact context drift as SMK-01).
- `SMK-03` also used `TOT_LOG_LEVEL='debug'` (same low-impact context drift as SMK-01).
- `SMK-04` also used `TOT_LOG_LEVEL='debug'` (same low-impact context drift as SMK-01).
- `SMK-05` also used `TOT_LOG_LEVEL='debug'` (same low-impact context drift as SMK-01).
- `MLG-02` and `MLG-03` also used `TOT_LOG_LEVEL='debug'` (same low-impact context drift as SMK-01).
- `NFM-A` also used `TOT_LOG_LEVEL='debug'` (same low-impact context drift as SMK-01).
- `NFM-B` also used `TOT_LOG_LEVEL='debug'` (same low-impact context drift as SMK-01).
- `PRC-01` also used `TOT_LOG_LEVEL='debug'` (same low-impact context drift as SMK-01).
- Initial environment snapshot used `%APPDATA%\\toT\\...` OCR path in early notes.
  - Correct runtime path for this build is `%APPDATA%\\@cibersino\\tot\\...`.
  - Impact/risk: low, documentation-only correction.
