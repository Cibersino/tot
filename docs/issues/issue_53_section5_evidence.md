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

- Date/time started:
- OS:
- App version/commit:
- Runtime command:
- TOT_LOG_LEVEL:
- OCR credentials path:
- OCR token path:

## Section 5 Checklist Coverage Map

1. Build and run core smoke matrix (OCR, native, PDF triage, dual-route choice)
- Status:
- Evidence blocks:

2. Add multilingual smoke coverage across OCR + native routes (at least Latin, CJK, and RTL samples)
- Status:
- Evidence blocks:

3. Run native-route fixture matrix (format coverage + corrupt/encrypted/empty-text-layer cases)
- Status:
- Evidence blocks:

4. Validate precondition rejection scenarios and explicit reason messaging
- Status:
- Evidence blocks:

5. Validate processing lock behavior (distinct from startup lock; only close/minimize/move/abort available)
- Status:
- Evidence blocks:

6. Validate close-window-during-processing cancellation path and invariants
- Status:
- Evidence blocks:

7. Validate failure/abort invariants and state separation
- Status:
- Evidence blocks:

8. Validate access / billing / activation model behavior (activation gating, restriction paths, quota/budget/usage-limit failures)
- Status:
- Evidence blocks:

9. Validate canonical apply behavior (overwrite/append/repetitions, MAX_TEXT_CHARS, truncation notice)
- Status:
- Evidence blocks:

10. Validate observability coverage for required fields/events
- Status:
- Evidence blocks:

11. Block progression until basic smoke/quality gate passes
- Status:
- Evidence blocks:

## Section 5 Item 1: Core Smoke Matrix

### SMK-01 Native Baseline

- Objective:
- Fixture:
- Preconditions:
- Steps:
- Expected:
- Actual:
- Alerts/notifications observed:
- Route metadata observed:
- Result: `PASS` / `FAIL` / `BLOCKED`
- Notes:

### SMK-02 OCR Baseline

- Objective:
- Fixture:
- Preconditions:
- Steps:
- Expected:
- Actual:
- Alerts/notifications observed:
- Route metadata observed:
- Result: `PASS` / `FAIL` / `BLOCKED`
- Notes:

### SMK-03 PDF Triage `ocr_only`

- Objective:
- Fixture:
- Preconditions:
- Steps:
- Expected:
- Actual:
- Alerts/notifications observed:
- Route metadata observed:
- Result: `PASS` / `FAIL` / `BLOCKED`
- Notes:

### SMK-04 PDF Triage `both` -> choose `native`

- Objective:
- Fixture:
- Preconditions:
- Steps:
- Expected:
- Actual:
- Alerts/notifications observed:
- Route metadata observed:
- Result: `PASS` / `FAIL` / `BLOCKED`
- Notes:

### SMK-05 PDF Triage `both` -> choose `ocr`

- Objective:
- Fixture:
- Preconditions:
- Steps:
- Expected:
- Actual:
- Alerts/notifications observed:
- Route metadata observed:
- Result: `PASS` / `FAIL` / `BLOCKED`
- Notes:

## Drift Log

- None so far.

