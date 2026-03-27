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
- two duplicated policy surfaces remain as drift risks

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

Strong suspicion.
The duplication is real.
An active behavior conflict is not currently proven.

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

## Candidate 2: Duplicated Persisted-Token Read Classification

### Candidate

`classifyPersistedTokenReadFailure(...)` duplication across:

- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js`](../../electron/import_extract_platform/ocr_google_drive_setup_validation.js)
- [`electron/import_extract_platform/ocr_google_drive_route.js`](../../electron/import_extract_platform/ocr_google_drive_route.js)

### Category

`parallel/stale surface`

### Current Status

Strong suspicion.
Both paths are live.
The risk is future drift, not proven deadness.

### Why It Looks Dead

Two active consumers still own the same token-read classification logic separately.
That is the same maintenance pattern that previously produced contract drift elsewhere.

### Evidence

Duplicated classifiers:

- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js:347`](../../electron/import_extract_platform/ocr_google_drive_setup_validation.js#L347)
- [`electron/import_extract_platform/ocr_google_drive_route.js:149`](../../electron/import_extract_platform/ocr_google_drive_route.js#L149)

Search string used:

- `classifyPersistedTokenReadFailure`

### What Could Be Lost If Removed

- route-specific summary strings and stage-specific wording

### Recommended Action

`collapse into canonical owner`

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
