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

Additional findings after the OCR gate removal:

- no additional proven dead files were found
- no additional dead preload bridges were found
- no proven renderer-to-missing-handler IPC mismatches were found
- one backend IPC contract looks unused from current runtime surfaces
- two exported symbols remain provably unused inside the repo
- two duplicated policy surfaces remain as drift risks
- historical Issue 53 docs still describe the retired OCR gate as live

## Negative Findings

These checks did not produce additional dead-surface candidates:

- every import/extract/OCR bridge exposed in [`electron/preload.js`](../../electron/preload.js) has an in-repo consumer in:
  - [`public/renderer.js`](../../public/renderer.js)
  - [`public/js/import_extract_entry.js`](../../public/js/import_extract_entry.js)
  - [`public/js/import_extract_ocr_activation_recovery.js`](../../public/js/import_extract_ocr_activation_recovery.js)
  - [`public/js/import_extract_ocr_disconnect.js`](../../public/js/import_extract_ocr_disconnect.js)
- no live renderer caller was found for a channel that lacks current main registration

## Candidate 1: Backend-Only OCR Setup Validation IPC

### Candidate

`ocr-google-drive-validate-setup`

### Category

`dead IPC contract`

### Current Status

Evaluated.
Dead in the current shipped contract surface.
Safe to remove because the validator remains live through prepare/activation flows.

### Why It Looks Dead

The handler was registered in main, but there was no preload bridge and no in-repo renderer caller.

In the current shipped renderer architecture, that meant the contract was not part of the live app flow.

### Evidence

Pre-removal evidence:

- former main registration in [`electron/main.js`](../../electron/main.js)
- dedicated handler module removed after evaluation

Search strings used:

- `ocr-google-drive-validate-setup`
- `ocrGoogleDriveSetupValidationIpc`

Search result summary:

- found registration and dedicated handler module before removal
- found historical issue-doc references
- found no preload exposure in [`electron/preload.js`](../../electron/preload.js)
- found no renderer call sites in `public/*`

Current state after fix:

- standalone IPC registration removed from [`electron/main.js`](../../electron/main.js)
- dead wrapper module deleted
- shared validator remains live through:
  - [`electron/import_extract_platform/import_extract_prepare_execute_core.js`](../../electron/import_extract_platform/import_extract_prepare_execute_core.js)
  - [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js`](../../electron/import_extract_platform/import_extract_ocr_activation_ipc.js)

Historical context that suggests a staged seam rather than accidental dead code:

- [`docs/issues/issue_53_operation_tracker.md:6103`](./issue_53_operation_tracker.md#L6103)
- [`docs/issues/issue_53_operation_tracker.md:6145`](./issue_53_operation_tracker.md#L6145)

### What Could Be Lost If Removed

- a backend seam for a future OCR diagnostics/settings flow
- a reusable structured validation IPC if the product later wants explicit setup diagnostics in UI

### Recommended Action

`delete`

## Candidate 2: Exported `buildRouteMetadata`

### Candidate

`buildRouteMetadata` export from [`electron/import_extract_platform/import_extract_prepare_execute_core.js`](../../electron/import_extract_platform/import_extract_prepare_execute_core.js)

### Category

`dead export`

### Current Status

Evaluated.
Dead exported surface removed.
The helper remains live as a same-file implementation detail.

### Why It Looks Dead

The function is exported, but there is no external in-repo consumer.
Only same-file internal callers use it.

### Evidence

Pre-removal evidence:

- [`electron/import_extract_platform/import_extract_prepare_execute_core.js:152`](../../electron/import_extract_platform/import_extract_prepare_execute_core.js#L152)
- former export from [`electron/import_extract_platform/import_extract_prepare_execute_core.js`](../../electron/import_extract_platform/import_extract_prepare_execute_core.js) removed after evaluation

Search string used:

- `buildRouteMetadata`

Search result summary:

- hits only the definition
- hits same-file internal calls
- hits the export
- no external module import or call site

Current state after fix:

- dead export removed from [`electron/import_extract_platform/import_extract_prepare_execute_core.js`](../../electron/import_extract_platform/import_extract_prepare_execute_core.js)
- helper remains live only through same-file internal callers

### What Could Be Lost If Removed

- only out-of-repo direct importers, if any exist outside this repo

### Recommended Action

`delete`

## Candidate 3: Exported `cleanupExpiredRecords`

### Candidate

`cleanupExpiredRecords` export from [`electron/import_extract_platform/import_extract_prepared_store.js`](../../electron/import_extract_platform/import_extract_prepared_store.js)

### Category

`dead export`

### Current Status

Proven dead inside the repo.

### Why It Looks Dead

The function is exported, but only the prepared-store module itself calls it.

### Evidence

Definition and export:

- [`electron/import_extract_platform/import_extract_prepared_store.js:51`](../../electron/import_extract_platform/import_extract_prepared_store.js#L51)
- [`electron/import_extract_platform/import_extract_prepared_store.js:130`](../../electron/import_extract_platform/import_extract_prepared_store.js#L130)

Search string used:

- `cleanupExpiredRecords`

Search result summary:

- hits only the definition
- hits same-file internal calls
- hits the export
- no external module import or call site

### What Could Be Lost If Removed

- only out-of-repo direct importers, if any exist outside this repo

### Recommended Action

`delete`

## Candidate 4: Exported `probeGoogleDriveApiPath`

### Candidate

`probeGoogleDriveApiPath` export from [`electron/import_extract_platform/ocr_google_drive_setup_validation.js`](../../electron/import_extract_platform/ocr_google_drive_setup_validation.js)

### Category

`dead export`

### Current Status

Proven dead inside the repo as an exported surface.

### Why It Looks Dead

The function is live internally as the default `apiProbe`, but the export itself has no in-repo consumer.

### Evidence

Definition, internal use, and export:

- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js:371`](../../electron/import_extract_platform/ocr_google_drive_setup_validation.js#L371)
- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js:469`](../../electron/import_extract_platform/ocr_google_drive_setup_validation.js#L469)
- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js:650`](../../electron/import_extract_platform/ocr_google_drive_setup_validation.js#L650)

Search string used:

- `probeGoogleDriveApiPath`

Search result summary:

- hits only the definition
- hits same-file default-parameter use
- hits the export
- no external module import or call site

### What Could Be Lost If Removed

- only out-of-repo direct importers, if any exist outside this repo

### Recommended Action

`delete`

## Candidate 5: Duplicated Credentials Validation Policy

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

## Candidate 6: Duplicated Persisted-Token Read Classification

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

## Candidate 7: Historical Docs That Still Describe The Retired OCR Gate As Live

### Candidate

Historical Issue 53 tracker/evidence references to the removed OCR gate surface.

### Category

`stale docs`

### Current Status

Not dead / intentional.
These docs appear to preserve historical implementation state rather than acting as live inventory.

### Why It Looks Dead

The docs still contain present-tense descriptions of:

- `evaluateImportExtractOcrGate`
- `import_extract_ocr_gate_ipc.js`

Those are no longer live surfaces in the current repo.

### Evidence

Examples:

- [`docs/issues/issue_53_operation_tracker.md:5739`](./issue_53_operation_tracker.md#L5739)
- [`docs/issues/issue_53_operation_tracker.md:5742`](./issue_53_operation_tracker.md#L5742)
- [`docs/issues/issue_53_operation_tracker.md:5767`](./issue_53_operation_tracker.md#L5767)
- [`docs/issues/issue_53_section5_evidence.md:885`](./issue_53_section5_evidence.md#L885)
- [`docs/issues/issue_53_section5_evidence.md:1084`](./issue_53_section5_evidence.md#L1084)

Search strings used:

- `evaluateImportExtractOcrGate`
- `import_extract_ocr_gate_ipc`

### What Could Be Lost If Removed

- historical evidence trail
- implementation chronology
- prior acceptance evidence tied to earlier contract shapes

### Recommended Action

`keep but document`

## Decision Rules

For each candidate above, the decision must be one of:

- `delete`
- `keep but document`
- `collapse into canonical owner`
- `needs explicit compatibility decision`

The repo should not mix “probably dead” and “safe to remove” without a recorded decision.

## Recommended Work Order

1. Evaluate remaining dead exports:
   - `cleanupExpiredRecords`
   - `probeGoogleDriveApiPath`
2. Collapse duplicated credentials-validation logic if the owner can be defined cleanly.
3. Collapse duplicated token-read classification if the owner can be defined cleanly.
4. Decide whether historical docs need annotation, not deletion.

## Acceptance Criteria

- Every candidate in this issue has an explicit decision.
- No candidate is deleted only because it “looks unused.”
- Any deleted surface has evidence that no live in-repo consumer depends on it.
- Any kept dormant surface is documented as intentional.
- Any collapsed policy surface ends with one clear canonical owner.
- Live inventory docs do not describe removed surfaces as active.
- Historical evidence docs are preserved unless there is a deliberate archival decision.

## Notes

- This issue intentionally separates safe cleanup candidates from compatibility/architecture seams.
- The backend-only OCR setup-validation IPC is the most important decision item because it is the clearest current unused contract but may still be an intentional future seam.
- The duplicated policy helpers are not automatically deletion candidates; they are first-class drift-risk items.
