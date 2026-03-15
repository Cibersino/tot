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
- OCR credentials path: `%APPDATA%\\toT\\config\\ocr_google_drive\\credentials.json` (`exists=False` at start)
- OCR token path: `%APPDATA%\\toT\\config\\ocr_google_drive\\token.json` (`exists=False` at start)

## Section 5 Checklist Coverage Map

1. Build and run core smoke matrix (OCR, native, PDF triage, dual-route choice)
- Status: `IN_PROGRESS`
- Evidence blocks: `SMK-01`, `SMK-02`, `SMK-03`, `SMK-04`, `SMK-05`

2. Add multilingual smoke coverage across OCR + native routes (at least Latin, CJK, and RTL samples)
- Status: `PENDING`
- Evidence blocks: none yet

3. Run native-route fixture matrix (format coverage + corrupt/encrypted/empty-text-layer cases)
- Status: `PENDING`
- Evidence blocks: none yet

4. Validate precondition rejection scenarios and explicit reason messaging
- Status: `PENDING`
- Evidence blocks: none yet

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
- Actual: pending manual execution
- Alerts/notifications observed: pending
- Route metadata observed: pending
- Result: `PENDING`
- Notes:
  - backend dry-run probe (pre-manual) indicates native parser readiness for this fixture:
    - `runNativeExtractionRoute('tools_local/smoke/prueba_docx.docx') -> state=success, len=130692`

### SMK-02 OCR Baseline

- Objective: Verify OCR route for image files with activation-aware behavior and post-extraction apply modal.
- Fixture: `tools_local/smoke/prueba_png.png`
- Preconditions: same as SMK-01
- Steps: pending
- Expected: OCR path executes; apply modal appears after success.
- Actual: pending
- Alerts/notifications observed: pending
- Route metadata observed: pending
- Result: `PENDING`
- Notes:

### SMK-03 PDF Triage `ocr_only`

- Objective: Verify PDF triage chooses OCR-only path when native text layer is not usable.
- Fixture: `tools_local/smoke/prueba_pdf_2_escaneado_12_paginas.pdf`
- Preconditions: same as SMK-01
- Steps: pending
- Expected: no route-choice modal; PDF triage resolves to `ocr_only`; OCR executes.
- Actual: pending
- Alerts/notifications observed: pending
- Route metadata observed: pending
- Result: `PENDING`
- Notes:

### SMK-04 PDF Triage `both` -> choose `native`

- Objective: Verify explicit route-choice UX for dual-route PDF and native branch execution.
- Fixture: `tools_local/smoke/prueba_pdf_original_12_paginas.pdf`
- Preconditions: same as SMK-01 + OCR available for `both` outcome
- Steps: pending
- Expected: route-choice modal appears; choosing `native` executes native route.
- Actual: pending
- Alerts/notifications observed: pending
- Route metadata observed: pending
- Result: `PENDING`
- Notes:

### SMK-05 PDF Triage `both` -> choose `ocr`

- Objective: Verify explicit route-choice UX for dual-route PDF and OCR branch execution.
- Fixture: `tools_local/smoke/prueba_pdf_original_12_paginas.pdf`
- Preconditions: same as SMK-04
- Steps: pending
- Expected: route-choice modal appears; choosing `ocr` executes OCR route.
- Actual: pending
- Alerts/notifications observed: pending
- Route metadata observed: pending
- Result: `PENDING`
- Notes:

## Drift Log

- None so far.
