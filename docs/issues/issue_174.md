# Import/Extract/OCR Dead And Near-Dead Surface Review

## Summary

This issue tracks a repo-wide diagnostic review of the import/extract/OCR feature for additional dead or near-dead surfaces after the stale parallel OCR gate was removed.

The goal is not to delete anything immediately.
The goal is to evaluate each candidate one by one, make an explicit keep/delete/collapse decision, and then fix only what is justified by evidence.

This is a diagnostic and contract-hygiene issue.
It is not a blanket cleanup issue.

## Scope

In scope:

- import/extract main-window flow
- Google OCR activation, validation, runtime, and disconnect paths
- preload bridge surface for import/extract/OCR
- main-process IPC registrations for import/extract/OCR
- module exports under `electron/import_extract_platform/`
- issue/docs inventory that still describes no-longer-live surfaces

Out of scope:

- unrelated renderer/UI cleanup
- non-import/extract feature bridges
- speculative deletion without evidence
- historical docs cleanup that would erase useful implementation evidence

## Audit Result Overview

Additional findings after the OCR gate removal review and current state:

- no additional proven dead files were found
- no additional dead preload bridges were found
- no proven renderer-to-missing-handler IPC mismatches were found
- one duplicated policy surface remains as a drift risk

## Negative Findings

These checks did not produce additional dead-surface candidates:

- every import/extract/OCR bridge exposed in [`electron/preload.js`](../../electron/preload.js) has an in-repo consumer in:
  - [`public/renderer.js`](../../public/renderer.js)
  - [`public/js/import_extract_entry.js`](../../public/js/import_extract_entry.js)
  - [`public/js/import_extract_ocr_activation_recovery.js`](../../public/js/import_extract_ocr_activation_recovery.js)
  - [`public/js/import_extract_ocr_disconnect.js`](../../public/js/import_extract_ocr_disconnect.js)
- no live renderer caller was found for a channel that lacks current main registration

## Candidate 1: Duplicated Credentials Validation Policy

### Candidate

Credentials-shape validation helpers across:

- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js`](../../electron/import_extract_platform/import_extract_ocr_activation_ipc.js)
- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js`](../../electron/import_extract_platform/ocr_google_drive_setup_validation.js)
- [`electron/import_extract_platform/ocr_google_drive_bundled_credentials.js`](../../electron/import_extract_platform/ocr_google_drive_bundled_credentials.js)

### Category

`parallel/stale surface`

### Current Status

Resolved.
Implemented as a collapse into a canonical owner.

### Why It Looks Dead

Multiple modules still own materially overlapping credentials-validation rules, which makes one canonical owner hard to identify and creates drift risk in future fixes.

### Evidence

Duplicated helpers:

- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js:58`](../../electron/import_extract_platform/import_extract_ocr_activation_ipc.js#L58)
- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js:244`](../../electron/import_extract_platform/import_extract_ocr_activation_ipc.js#L244)
- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js:182`](../../electron/import_extract_platform/ocr_google_drive_setup_validation.js#L182)
- [`electron/import_extract_platform/ocr_google_drive_bundled_credentials.js:47`](../../electron/import_extract_platform/ocr_google_drive_bundled_credentials.js#L47)
- [`electron/import_extract_platform/ocr_google_drive_bundled_credentials.js:63`](../../electron/import_extract_platform/ocr_google_drive_bundled_credentials.js#L63)

Search strings used:

- `hasValidCredentialsShape`
- `validateCredentialsFile`
- `validateStoredCredentialsFile`

### What Could Be Lost If Removed

- phase-specific telemetry and error shaping in:
  - bundled-credentials bootstrap
  - activation prepare/launch
  - setup validation

### Recommended Action

`collapse into canonical owner`

### Decision

`collapsed into canonical owner`

### Implementation Outcome

Canonical owner:

- [`electron/import_extract_platform/ocr_google_drive_credentials_file.js`](../../electron/import_extract_platform/ocr_google_drive_credentials_file.js)

Current consumer boundaries:

- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js`](../../electron/import_extract_platform/import_extract_ocr_activation_ipc.js) keeps activation-phase result shaping and alert mapping.
- [`electron/import_extract_platform/ocr_google_drive_bundled_credentials.js`](../../electron/import_extract_platform/ocr_google_drive_bundled_credentials.js) keeps bundled-bootstrap/runtime-mirror mapping.
- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js`](../../electron/import_extract_platform/ocr_google_drive_setup_validation.js) keeps setup-validation result shaping and its stricter outward diagnostics surface.

Compatibility notes:

- the shared helper exports only `readGoogleOAuthCredentialsFile(...)`
- empty-file parse diagnostics are centralized in the helper, not reimplemented in callers
- setup validation still leaves `credentialsErrorName` empty for `empty_file` and `invalid_json`

## Candidate 2: Duplicated Persisted-Token Read Classification

### Candidate

`INVALID_PERSISTED_TOKEN_CODES` and `classifyPersistedTokenReadFailure(...)` duplication across:

- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js`](../../electron/import_extract_platform/ocr_google_drive_setup_validation.js)
- [`electron/import_extract_platform/ocr_google_drive_route.js`](../../electron/import_extract_platform/ocr_google_drive_route.js)

### Category

`parallel/stale surface`

### Current Status

Confirmed drift risk.
Both paths are live and currently behaviorally aligned.
This is not proven deadness; it is duplicated token-read policy that can drift.

### Why It Looks Dead

Two active consumers still own the same token-read failure policy separately.
That duplicated policy includes both the invalid-token code set and the classifier mapping.
The two copies currently agree on semantic result-code mapping, but they can drift independently.

### Evidence

Duplicated invalid-token code sets:

- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js:56`](../../electron/import_extract_platform/ocr_google_drive_setup_validation.js#L56)
- [`electron/import_extract_platform/ocr_google_drive_route.js:67`](../../electron/import_extract_platform/ocr_google_drive_route.js#L67)

Duplicated classifiers:

- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js:315`](../../electron/import_extract_platform/ocr_google_drive_setup_validation.js#L315)
- [`electron/import_extract_platform/ocr_google_drive_route.js:149`](../../electron/import_extract_platform/ocr_google_drive_route.js#L149)

Current call sites using the duplicated mapping:

- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js:508`](../../electron/import_extract_platform/ocr_google_drive_setup_validation.js#L508)
- [`electron/import_extract_platform/ocr_google_drive_route.js:399`](../../electron/import_extract_platform/ocr_google_drive_route.js#L399)

Search strings used:

- `INVALID_PERSISTED_TOKEN_CODES`
- `classifyPersistedTokenReadFailure`

### What Could Be Lost If Removed

- setup-validation summary wording
- route-specific summary/message wording

### Recommended Action

`collapse into canonical owner`

### Decision

`collapse into canonical owner`

### Proposed Action

Introduce one shared helper that owns token-read failure category mapping from token-storage read codes.
Keep caller-specific summary/message shaping in:

- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js`](../../electron/import_extract_platform/ocr_google_drive_setup_validation.js)
- [`electron/import_extract_platform/ocr_google_drive_route.js`](../../electron/import_extract_platform/ocr_google_drive_route.js)

## Decision Rules

For each candidate above, the decision must be one of:

- `keep but document`
- `collapse into canonical owner`
- `needs explicit compatibility decision`

The repo should not mix “probably dead” and “safe to remove” without a recorded decision.

## Recommended Work Order

1. Collapse duplicated credentials-validation logic if the owner can be defined cleanly.
2. Collapse duplicated token-read classification if the owner can be defined cleanly.

## Acceptance Criteria

- Every candidate in this issue has an explicit decision.
- Any kept dormant surface is documented as intentional.
- Any collapsed policy surface ends with one clear canonical owner.

## Notes

- This issue intentionally separates safe cleanup candidates from compatibility/architecture seams.
- The duplicated policy helpers are not automatically deletion candidates; they are first-class drift-risk items.
